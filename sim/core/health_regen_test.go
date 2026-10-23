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

// The hunter owner with its pets, nothing swinging until the pull; prepull holds the rotation's
// prepull actions.
func setupHealthRegenSim(prepull ...*proto.APLPrepullAction) (*core.Simulation, *petOwner) {
	sim := core.NewSim(&proto.RaidSimRequest{
		SimOptions: &proto.SimOptions{RandomSeed: 100},
		Raid: &proto.Raid{Parties: []*proto.Party{{Players: []*proto.Player{{
			Name:      "Owner",
			Race:      proto.Race_RaceHuman,
			Class:     proto.Class_ClassHunter,
			Spec:      &proto.Player_Hunter{},
			Equipment: &proto.EquipmentSpec{},
			Rotation:  &proto.APLRotation{PrepullActions: prepull},
		}}}}},
		Encounter: &proto.Encounter{Targets: []*proto.Target{{Name: "target", Level: 60}}, Duration: 180},
	}, simsignals.CreateSignals())
	sim.Reset()
	for _, unit := range sim.Raid.AllUnits {
		unit.AutoAttacks.CancelAutoSwing(sim)
	}
	return sim, sim.Raid.Parties[0].Players[0].(*petOwner)
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

// 10 HP5 credits 4 health on each 2 s tick, the first at 2 s.
func TestHealthRegenTicksEveryTwoSeconds(t *testing.T) {
	sim, owner := setupHealthRegenSim()
	owner.AddStatsDynamic(sim, stats.Stats{stats.HP5: 10})
	owner.SetCurrentHealthPercent(0.5)

	gained := recordHealthGained(sim, &owner.Unit, 2*time.Second-time.Millisecond, 2*time.Second, 4*time.Second-time.Millisecond, 4*time.Second)
	stepTo(t, sim, 5*time.Second)
	if want := []float64{0, 4, 4, 8}; !slices.Equal(gained, want) {
		t.Errorf("health gained by 1.999 s, 2 s, 3.999 s and 4 s: %v, want %v", gained, want)
	}

	metrics := healthRegenMetrics(&owner.Unit)
	if metrics == nil {
		t.Fatal("no Health Regen health metric")
	}
	if metrics.Type != proto.ResourceType_ResourceTypeHealth || metrics.Events != 2 || metrics.ActualGain != 8 {
		t.Errorf("Health Regen metric: %v events of %v %v, want 2 events of 8 health", metrics.Events, metrics.ActualGain, metrics.Type)
	}
}

// The prepull earns no regen: the first tick still comes at 2 s.
func TestHealthRegenNoneBeforeCombat(t *testing.T) {
	sim, owner := setupHealthRegenSim(&proto.APLPrepullAction{
		DoAtValue: &proto.APLValue{Value: &proto.APLValue_Const{Const: &proto.APLValueConst{Val: "-1.5s"}}},
		Action: &proto.APLAction{Action: &proto.APLAction_Move{Move: &proto.APLActionMove{
			RangeFromTarget: &proto.APLValue{Value: &proto.APLValue_Const{Const: &proto.APLValueConst{Val: "5"}}},
		}}},
	})
	sim.PrePull()
	if sim.CurrentTime != -1500*time.Millisecond {
		t.Fatalf("the prepull starts at %v, want -1.5s", sim.CurrentTime)
	}
	owner.AddStatsDynamic(sim, stats.Stats{stats.HP5: 10})
	owner.RemoveHealth(sim, 100)

	gained := recordHealthGained(sim, &owner.Unit, 0, time.Second, 2*time.Second)
	stepTo(t, sim, 3*time.Second)
	if want := []float64{0, 0, 4}; !slices.Equal(gained, want) {
		t.Errorf("health gained by 0 s, 1 s and 2 s: %v, want %v", gained, want)
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

func TestHealthRegenStopsAfterDeath(t *testing.T) {
	sim, owner := setupHealthRegenSim()
	owner.AddStatsDynamic(sim, stats.Stats{stats.HP5: 10})
	owner.RemoveHealth(sim, owner.CurrentHealth())
	owner.Died(sim)

	gained := recordHealthGained(sim, &owner.Unit, 2*time.Second, 4*time.Second, 10*time.Second)
	stepTo(t, sim, 11*time.Second)
	if want := []float64{0, 0, 0}; !slices.Equal(gained, want) || owner.CurrentHealth() != 0 {
		t.Errorf("dead, the unit gained %v health by 2 s, 4 s and 10 s, want %v", gained, want)
	}
}

// HP5 gained at 3 s waits for the 4 s tick; the second before it earns nothing.
func TestHealthRegenStartsWhenHP5Gained(t *testing.T) {
	sim, owner := setupHealthRegenSim()
	sim.Environment.State = core.Constructed
	aura := owner.NewTemporaryStatsAura("Test HP5", core.ActionID{SpellID: 910700}, stats.Stats{stats.HP5: 10}, core.NeverExpires)
	sim.Environment.State = core.Finalized
	owner.SetCurrentHealthPercent(0.5)

	gained := recordHealthGained(sim, &owner.Unit, 3*time.Second, 4*time.Second-time.Millisecond, 4*time.Second, 6*time.Second)
	stepTo(t, sim, 3*time.Second)
	aura.Activate(sim)
	stepTo(t, sim, 7*time.Second)
	if want := []float64{0, 0, 4, 8}; !slices.Equal(gained, want) {
		t.Errorf("health gained by 3 s, 3.999 s, 4 s and 6 s: %v, want %v", gained, want)
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

	summoned := recordHealthGained(sim, &owner.pet.Unit, 2*time.Second, 4*time.Second)
	away := recordHealthGained(sim, &owner.dynamic.Unit, 2*time.Second, 4*time.Second)
	stepTo(t, sim, 5*time.Second)
	if want := []float64{4, 8}; !slices.Equal(summoned, want) {
		t.Errorf("the summoned pet gained %v health by 2 s and 4 s, want %v", summoned, want)
	}
	if want := []float64{0, 0}; !slices.Equal(away, want) {
		t.Errorf("the pet away gained %v health by 2 s and 4 s, want %v", away, want)
	}
}
