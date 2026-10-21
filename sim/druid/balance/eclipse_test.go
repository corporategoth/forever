package balance

import (
	"testing"
	"time"

	"github.com/wowsims/forever/sim/core"
	"github.com/wowsims/forever/sim/core/proto"
	"github.com/wowsims/forever/sim/core/simsignals"
	"github.com/wowsims/forever/sim/core/stats"
)

// 20 yd from the target, so Wrath's 20 yd/s missile lands 1 sec after the cast.
func newMoonkin(t *testing.T) (*core.Simulation, *BalanceDruid) {
	t.Helper()
	sim := core.NewSim(&proto.RaidSimRequest{
		SimOptions: &proto.SimOptions{RandomSeed: 1, Iterations: 1},
		Raid: &proto.Raid{Parties: []*proto.Party{{
			Players: []*proto.Player{{
				Name: "Moonkin", Class: proto.Class_ClassDruid, Race: proto.Race_RaceNightElf,
				TalentsString: DefaultTalents,
				Spec: &proto.Player_BalanceDruid{BalanceDruid: &proto.BalanceDruid{
					Options: &proto.BalanceDruid_Options{ClassOptions: &proto.DruidOptions{}},
				}},
				Equipment:          &proto.EquipmentSpec{},
				Consumables:        &proto.ConsumesSpec{},
				Buffs:              &proto.IndividualBuffs{},
				Rotation:           &proto.APLRotation{},
				DistanceFromTarget: 20,
			}},
			Buffs: &proto.PartyBuffs{},
		}}},
		Encounter: &proto.Encounter{Targets: []*proto.Target{{Name: "target", Level: 60}}, Duration: 60},
	}, simsignals.CreateSignals())
	sim.Reset()
	moonkin := sim.Raid.Parties[0].Players[0].(*BalanceDruid)
	if moonkin.Talents.Eclipse != 3 {
		t.Fatalf("the preset has Eclipse %d/3", moonkin.Talents.Eclipse)
	}
	// Down to the 1% miss floor against a level 60 target.
	moonkin.AddStatDynamic(sim, stats.SpellHitPercent, 10)
	moonkin.AddMana(sim, moonkin.MaxMana(), moonkin.NewManaMetrics(core.ActionID{SpellID: 1}))
	return sim, moonkin
}

func stepTo(t *testing.T, sim *core.Simulation, until time.Duration) {
	t.Helper()
	sim.AddPendingAction(core.NewDelayedAction(core.DelayedActionOptions{DoAt: until, OnAction: func(*core.Simulation) {}}))
	for steps := 0; sim.CurrentTime < until; steps++ {
		if steps > 10000 {
			t.Fatalf("the sim did not reach %v", until)
		}
		sim.Step()
	}
}

// Talent 408248 fires on the hit: Wrath's charges come once it lands, a spell batch later, and a
// Starfire begun while it is in the air keeps its full cast time.
func TestEclipseGrantsChargesWhenWrathLands(t *testing.T) {
	sim, moonkin := newMoonkin(t)
	eclipse := moonkin.GetAuraByID(core.ActionID{SpellID: 408255})
	if eclipse == nil {
		t.Fatal("Eclipse 3/3 registers no buff 408255")
	}
	starfire := moonkin.Starfire[len(moonkin.Starfire)-1]
	baseStarfire := starfire.CastTime()

	wrathCast := moonkin.Wrath.CastTime()
	if !moonkin.Wrath.Cast(sim, moonkin.CurrentTarget) {
		t.Fatal("Wrath did not cast")
	}
	stepTo(t, sim, wrathCast+core.SpellBatchWindow)
	if eclipse.IsActive() {
		t.Fatalf("Eclipse is up at %v, before Wrath lands", sim.CurrentTime)
	}
	if got := starfire.CastTime(); got != baseStarfire {
		t.Errorf("Starfire while Wrath is in the air casts in %v, want %v", got, baseStarfire)
	}

	stepTo(t, sim, wrathCast+time.Second+2*core.SpellBatchWindow)
	if !eclipse.IsActive() || eclipse.GetStacks() != 2 {
		t.Fatalf("Eclipse after Wrath lands: active %v with %d charges, want 2", eclipse.IsActive(), eclipse.GetStacks())
	}
	if got := starfire.CastTime(); got >= baseStarfire {
		t.Errorf("Starfire with Eclipse up casts in %v, want less than %v", got, baseStarfire)
	}
}
