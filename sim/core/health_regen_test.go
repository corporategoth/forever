package core_test

import (
	"slices"
	"testing"
	"time"

	"github.com/wowsims/forever/sim/core"
	"github.com/wowsims/forever/sim/core/proto"
	"github.com/wowsims/forever/sim/core/simsignals"
	"github.com/wowsims/forever/sim/core/stats"
)

const healthRegenTick = time.Millisecond * 2020

// The hunter owner with its pets, nothing swinging until the pull; prepull holds the rotation's
// prepull actions.
func setupHealthRegenSim(prepull ...*proto.APLPrepullAction) (*core.Simulation, *petOwner) {
	return setupHealthRegenSimWith(stats.Stats{}, prepull...)
}

// As setupHealthRegenSim, with bonus on the owner's sheet from the start.
func setupHealthRegenSimWith(bonus stats.Stats, prepull ...*proto.APLPrepullAction) (*core.Simulation, *petOwner) {
	sim := core.NewSim(&proto.RaidSimRequest{
		SimOptions: &proto.SimOptions{RandomSeed: 100},
		Raid: &proto.Raid{Parties: []*proto.Party{{Players: []*proto.Player{{
			Name:       "Owner",
			Race:       proto.Race_RaceHuman,
			Class:      proto.Class_ClassHunter,
			Spec:       &proto.Player_Hunter{},
			Equipment:  &proto.EquipmentSpec{},
			BonusStats: &proto.UnitStats{Stats: bonus.ToProtoArray()},
			Rotation:   &proto.APLRotation{PrepullActions: prepull},
		}}}}},
		Encounter: &proto.Encounter{Targets: []*proto.Target{{Name: "target", Level: 60}}, Duration: 180},
	}, simsignals.CreateSignals())
	sim.Reset()
	for _, unit := range sim.Raid.AllUnits {
		unit.AutoAttacks.CancelAutoSwing(sim)
	}
	return sim, sim.Raid.Parties[0].Players[0].(*petOwner)
}

// A prepull action at doAt, so the sim starts there.
func prepullMoveAt(doAt string) *proto.APLPrepullAction {
	return &proto.APLPrepullAction{
		DoAtValue: &proto.APLValue{Value: &proto.APLValue_Const{Const: &proto.APLValueConst{Val: doAt}}},
		Action: &proto.APLAction{Action: &proto.APLAction_Move{Move: &proto.APLActionMove{
			RangeFromTarget: &proto.APLValue{Value: &proto.APLValue_Const{Const: &proto.APLValueConst{Val: "5"}}},
		}}},
	}
}

// The health the unit gains from now up to each time, read once everything else due then has run.
func recordHealthGained(sim *core.Simulation, unit *core.Unit, times ...time.Duration) []float64 {
	start := unit.CurrentHealth()
	gained := make([]float64, len(times))
	for i, at := range times {
		sim.AddPendingAction(core.NewDelayedAction(core.DelayedActionOptions{
			DoAt:     at,
			Priority: core.ActionPriorityLow,
			OnAction: func(*core.Simulation) { gained[i] = unit.CurrentHealth() - start },
		}))
	}
	return gained
}

func healthRegenMetrics(unit *core.Unit) *proto.ResourceMetrics {
	for _, metrics := range unit.Metrics.ToProto().Resources {
		if metrics.Id.GetOtherId() == proto.OtherAction_OtherActionHealthRegen {
			return metrics
		}
	}
	return nil
}

// 10 HP5 credits 4 health on each 2.02 s tick, the first at 2.02 s.
func TestHealthRegenTicksEvery2020Milliseconds(t *testing.T) {
	sim, owner := setupHealthRegenSim()
	owner.AddStatsDynamic(sim, stats.Stats{stats.HP5: 10})
	owner.SetCurrentHealthPercent(0.5)

	gained := recordHealthGained(sim, &owner.Unit, healthRegenTick-time.Millisecond, healthRegenTick, 2*healthRegenTick-time.Millisecond, 2*healthRegenTick)
	stepTo(t, sim, 5*time.Second)
	if want := []float64{0, 4, 4, 8}; !slices.Equal(gained, want) {
		t.Errorf("health gained by 2.019 s, 2.02 s, 4.039 s and 4.04 s: %v, want %v", gained, want)
	}

	metrics := healthRegenMetrics(&owner.Unit)
	if metrics == nil {
		t.Fatal("no Health Regen health metric")
	}
	if metrics.Type != proto.ResourceType_ResourceTypeHealth || metrics.Events != 2 || metrics.ActualGain != 8 {
		t.Errorf("Health Regen metric: %v events of %v %v, want 2 events of 8 health", metrics.Events, metrics.ActualGain, metrics.Type)
	}
}

// HP5 on the sheet from the start ticks from the pull's first tick.
func TestHealthRegenFromResetHP5(t *testing.T) {
	sim, owner := setupHealthRegenSimWith(stats.Stats{stats.HP5: 10})
	if got := owner.GetStat(stats.HP5); got != 10 {
		t.Fatalf("the owner starts with %v HP5, want 10", got)
	}
	owner.SetCurrentHealthPercent(0.5)

	gained := recordHealthGained(sim, &owner.Unit, healthRegenTick-time.Millisecond, healthRegenTick)
	stepTo(t, sim, 3*time.Second)
	if want := []float64{0, 4}; !slices.Equal(gained, want) {
		t.Errorf("health gained by 2.019 s and 2.02 s: %v, want %v", gained, want)
	}
}

// The prepull earns no regen: the first tick still comes at 2.02 s.
func TestHealthRegenNoneBeforeCombat(t *testing.T) {
	sim, owner := setupHealthRegenSim(prepullMoveAt("-1.5s"))
	sim.PrePull()
	if sim.CurrentTime != -1500*time.Millisecond {
		t.Fatalf("the prepull starts at %v, want -1.5s", sim.CurrentTime)
	}
	owner.AddStatsDynamic(sim, stats.Stats{stats.HP5: 10})
	owner.RemoveHealth(sim, 100)

	gained := recordHealthGained(sim, &owner.Unit, 0, time.Second, 2*time.Second, healthRegenTick)
	stepTo(t, sim, 3*time.Second)
	if want := []float64{0, 0, 0, 4}; !slices.Equal(gained, want) {
		t.Errorf("health gained by 0 s, 1 s, 2 s and 2.02 s: %v, want %v", gained, want)
	}
}

// HP5 gained more than a tick before the pull still waits for the 2.02 s tick, with none at 0.
func TestHealthRegenEarlyPrepullGainWaitsForThePull(t *testing.T) {
	sim, owner := setupHealthRegenSim(prepullMoveAt("-3s"))
	sim.PrePull()
	if sim.CurrentTime != -3*time.Second {
		t.Fatalf("the prepull starts at %v, want -3s", sim.CurrentTime)
	}
	owner.AddStatsDynamic(sim, stats.Stats{stats.HP5: 10})
	owner.RemoveHealth(sim, 100)

	gained := recordHealthGained(sim, &owner.Unit, 0, healthRegenTick-time.Millisecond, healthRegenTick)
	stepTo(t, sim, 3*time.Second)
	if want := []float64{0, 0, 4}; !slices.Equal(gained, want) {
		t.Errorf("health gained by 0 s, 2.019 s and 2.02 s: %v, want %v", gained, want)
	}
}

// A tick credits only up to the maximum; the metric records the share that landed.
func TestHealthRegenCapsAtMaxHealth(t *testing.T) {
	sim, owner := setupHealthRegenSim()
	owner.AddStatsDynamic(sim, stats.Stats{stats.HP5: 10})
	owner.RemoveHealth(sim, 1)

	stepTo(t, sim, 3*time.Second)
	if got, want := owner.CurrentHealth(), owner.MaxHealth(); got != want {
		t.Errorf("health %v after the tick, want the maximum %v", got, want)
	}
	if metrics := healthRegenMetrics(&owner.Unit); metrics == nil || metrics.ActualGain != 1 {
		t.Errorf("Health Regen metric %v, want 1 health gained", metrics)
	}
}

// A dead unit gains nothing from its HP5.
func TestHealthRegenStopsAfterDeath(t *testing.T) {
	sim, owner := setupHealthRegenSim()
	owner.AddStatsDynamic(sim, stats.Stats{stats.HP5: 10})
	owner.RemoveHealth(sim, owner.CurrentHealth())
	owner.Died(sim)

	gained := recordHealthGained(sim, &owner.Unit, healthRegenTick, 2*healthRegenTick, 10*time.Second)
	stepTo(t, sim, 11*time.Second)
	if want := []float64{0, 0, 0}; !slices.Equal(gained, want) || owner.CurrentHealth() != 0 {
		t.Errorf("dead, the unit gained %v health by 2.02 s, 4.04 s and 10 s, want %v", gained, want)
	}
}

// HP5 gained at 3 s waits for the 4.04 s tick; the time before it earns nothing.
func TestHealthRegenStartsWhenHP5Gained(t *testing.T) {
	sim, owner := setupHealthRegenSim()
	sim.Environment.State = core.Constructed
	aura := owner.NewTemporaryStatsAura("Test HP5", core.ActionID{SpellID: 910700}, stats.Stats{stats.HP5: 10}, core.NeverExpires)
	sim.Environment.State = core.Finalized
	owner.SetCurrentHealthPercent(0.5)

	gained := recordHealthGained(sim, &owner.Unit, 3*time.Second, 2*healthRegenTick-time.Millisecond, 2*healthRegenTick, 3*healthRegenTick)
	stepTo(t, sim, 3*time.Second)
	aura.Activate(sim)
	stepTo(t, sim, 7*time.Second)
	if want := []float64{0, 0, 4, 8}; !slices.Equal(gained, want) {
		t.Errorf("health gained by 3 s, 4.039 s, 4.04 s and 6.06 s: %v, want %v", gained, want)
	}
}

// HP5 lost at 3 s credits nothing at 4.04 s; HP5 regained at 5 s credits from the 6.06 s tick.
func TestHealthRegenSleepsWhenHP5Lost(t *testing.T) {
	sim, owner := setupHealthRegenSim()
	sim.Environment.State = core.Constructed
	aura := owner.NewTemporaryStatsAura("Test HP5", core.ActionID{SpellID: 910701}, stats.Stats{stats.HP5: 10}, core.NeverExpires)
	sim.Environment.State = core.Finalized
	aura.Activate(sim)
	owner.SetCurrentHealthPercent(0.5)

	gained := recordHealthGained(sim, &owner.Unit, healthRegenTick, 3*time.Second, 2*healthRegenTick, 5*time.Second, 3*healthRegenTick-time.Millisecond, 3*healthRegenTick)
	stepTo(t, sim, 3*time.Second)
	aura.Deactivate(sim)
	stepTo(t, sim, 5*time.Second)
	aura.Activate(sim)
	stepTo(t, sim, 7*time.Second)
	if want := []float64{4, 4, 4, 4, 4, 8}; !slices.Equal(gained, want) {
		t.Errorf("health gained by 2.02 s, 3 s, 4.04 s, 5 s, 6.059 s and 6.06 s: %v, want %v", gained, want)
	}
}

// A pet regenerates like a player while summoned and not while away.
func TestHealthRegenDisabledPet(t *testing.T) {
	sim, owner := setupHealthRegenSim()
	if !owner.pet.IsEnabled() || owner.dynamic.IsEnabled() {
		t.Fatalf("the true pet is enabled %v and the dynamic pet %v, want only the true pet", owner.pet.IsEnabled(), owner.dynamic.IsEnabled())
	}
	for _, pet := range []*testPet{owner.pet, owner.dynamic} {
		pet.AddStatsDynamic(sim, stats.Stats{stats.Health: 1000, stats.HP5: 10})
		pet.SetCurrentHealthPercent(0.5)
	}

	summoned := recordHealthGained(sim, &owner.pet.Unit, healthRegenTick, 2*healthRegenTick)
	away := recordHealthGained(sim, &owner.dynamic.Unit, healthRegenTick, 2*healthRegenTick)
	stepTo(t, sim, 5*time.Second)
	if want := []float64{4, 8}; !slices.Equal(summoned, want) {
		t.Errorf("the summoned pet gained %v health by 2.02 s and 4.04 s, want %v", summoned, want)
	}
	if want := []float64{0, 0}; !slices.Equal(away, want) {
		t.Errorf("the pet away gained %v health by 2.02 s and 4.04 s, want %v", away, want)
	}
}
