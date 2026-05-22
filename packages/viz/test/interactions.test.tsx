// @vitest-environment jsdom

// Interaction tests for the stateful viz components. The SSR smoke
// tests (components.test.tsx) prove each component *renders*; these
// prove its controls actually *do something* — clicking a control
// moves the selection / changes the rendered output. Catches dead
// onClick handlers, broken setState wiring, and controlled/uncontrolled
// regressions that SSR can't see (effects + events don't run in SSR).

import { afterEach, describe, expect, test } from "vitest";
import { createElement } from "react";
import { mountViz, isSelected, type VizHarness } from "./mountViz";

import { BeatGrid } from "../src/components/BeatGrid";
import { ComparativeAnatomy } from "../src/components/ComparativeAnatomy";
import { VotingSystems } from "../src/components/VotingSystems";
import { MapProjections } from "../src/components/MapProjections";
import { DoseResponseCurve } from "../src/components/DoseResponseCurve";
import { TruthTable } from "../src/components/TruthTable";
import { DnaElectropherogram } from "../src/components/DnaElectropherogram";
import { VitalSignsMonitor } from "../src/components/VitalSignsMonitor";
import { FlavorWheel } from "../src/components/FlavorWheel";
import { AirfoilPolar } from "../src/components/AirfoilPolar";
import { LedgerTAccounts } from "../src/components/LedgerTAccounts";
import { CropYieldResponse } from "../src/components/CropYieldResponse";
import { SurvivalCurve } from "../src/components/SurvivalCurve";
import { BtreeVsLsm } from "../src/components/BtreeVsLsm";
import { KeyExchange } from "../src/components/KeyExchange";
import { VirtualMemory } from "../src/components/VirtualMemory";
import { CacheHierarchy } from "../src/components/CacheHierarchy";
import { DagPipeline } from "../src/components/DagPipeline";
import { QuorumReplication } from "../src/components/QuorumReplication";
import { ToothAnatomy } from "../src/components/ToothAnatomy";
import { EnergyBalance } from "../src/components/EnergyBalance";
import { ForceVelocityCurve } from "../src/components/ForceVelocityCurve";
import { EventLoop } from "../src/components/EventLoop";
import { RenderPipeline } from "../src/components/RenderPipeline";
import { WcagContrast } from "../src/components/WcagContrast";
import { GalaxyRotationCurve } from "../src/components/GalaxyRotationCurve";
import { HubbleExpansion } from "../src/components/HubbleExpansion";
import { CpuScheduler } from "../src/components/CpuScheduler";

let h: VizHarness | null = null;
afterEach(() => {
  h?.unmount();
  h = null;
});

// Helper: click a preset button by label and assert the selection moved
// off `fromLabel` and onto `toLabel`.
function expectSelectionMoves(
  harness: VizHarness,
  fromLabel: string,
  toLabel: string,
) {
  expect(isSelected(harness.button(fromLabel))).toBe(true);
  expect(isSelected(harness.button(toLabel))).toBe(false);
  harness.click(harness.button(toLabel));
  expect(isSelected(harness.button(toLabel))).toBe(true);
  expect(isSelected(harness.button(fromLabel))).toBe(false);
}

describe("viz interactions", () => {
  test("BeatGrid: selecting a meter moves the active highlight", () => {
    h = mountViz(createElement(BeatGrid));
    expectSelectionMoves(h, "4/4", "3/4");
  });

  test("ComparativeAnatomy: picking a species moves the active highlight", () => {
    h = mountViz(createElement(ComparativeAnatomy));
    expectSelectionMoves(h, "dog", "cat");
  });

  test("VotingSystems: choosing a method moves the active highlight", () => {
    h = mountViz(createElement(VotingSystems));
    expectSelectionMoves(h, "FPTP", "IRV / RCV");
  });

  test("MapProjections: choosing a projection moves the active highlight", () => {
    h = mountViz(createElement(MapProjections));
    expectSelectionMoves(h, "mercator", "robinson");
  });

  test("DoseResponseCurve: choosing a compound moves the active highlight", () => {
    // Button labels are COMPOUNDS[c].label.slice(0, 7).
    h = mountViz(createElement(DoseResponseCurve));
    expectSelectionMoves(h, "Acetami", "Digoxin");
  });

  test("TruthTable: a preset rewrites the formula input", () => {
    h = mountViz(createElement(TruthTable));
    const input = () => h!.container.querySelector("input") as HTMLInputElement;
    expect(input().value).toBe("P -> Q");
    h.click(h.button("modus ponens"));
    expect(input().value).toBe("((P -> Q) & P) -> Q");
  });

  test("DnaElectropherogram: reroll regenerates the rendered profile", () => {
    h = mountViz(createElement(DnaElectropherogram));
    const before = h.html();
    h.click(h.button("Reroll A"));
    expect(h.html()).not.toBe(before);
  });

  test("VitalSignsMonitor: switching scenario moves the active highlight", () => {
    h = mountViz(createElement(VitalSignsMonitor));
    expectSelectionMoves(h, "Normal", "Desaturation");
  });

  test("FlavorWheel: picking a wine moves the active highlight", () => {
    h = mountViz(createElement(FlavorWheel));
    expectSelectionMoves(h, "Cabernet", "Riesling");
  });

  test("AirfoilPolar: choosing an AoA preset moves the active highlight", () => {
    h = mountViz(createElement(AirfoilPolar));
    expectSelectionMoves(h, "Cruise 4°", "Stall 16°");
  });

  test("LedgerTAccounts: stepping transactions moves the active highlight", () => {
    h = mountViz(createElement(LedgerTAccounts));
    expectSelectionMoves(h, "1. Invest", "3. Borrow");
  });

  test("CropYieldResponse: picking a nutrient moves the active highlight", () => {
    h = mountViz(createElement(CropYieldResponse));
    expectSelectionMoves(h, "Nitrogen", "Potassium");
  });

  test("SurvivalCurve: switching era moves the active highlight", () => {
    h = mountViz(createElement(SurvivalCurve));
    expectSelectionMoves(h, "1900", "2000");
  });

  test("BtreeVsLsm: switching engine moves the active highlight", () => {
    h = mountViz(createElement(BtreeVsLsm));
    expectSelectionMoves(h, "B-Tree", "LSM-Tree");
  });

  test("KeyExchange: switching parameter preset moves the active highlight", () => {
    h = mountViz(createElement(KeyExchange));
    expectSelectionMoves(h, "g=5, p=23", "g=2, p=97");
  });

  test("VirtualMemory: switching scenario moves the active highlight", () => {
    h = mountViz(createElement(VirtualMemory));
    expectSelectionMoves(h, "TLB hit", "Page fault");
  });

  test("CacheHierarchy: choosing a level moves the active highlight", () => {
    h = mountViz(createElement(CacheHierarchy));
    expectSelectionMoves(h, "L1", "L3");
  });

  test("DagPipeline: switching example DAG moves the active highlight", () => {
    h = mountViz(createElement(DagPipeline));
    expectSelectionMoves(h, "Daily ETL", "ML Pipeline");
  });

  test("QuorumReplication: switching preset moves the active highlight", () => {
    h = mountViz(createElement(QuorumReplication));
    expectSelectionMoves(h, "Quorum", "Read-optimized");
  });

  test("ToothAnatomy: switching caries stage moves the active highlight", () => {
    h = mountViz(createElement(ToothAnatomy));
    expectSelectionMoves(h, "Healthy", "Dentin");
  });

  test("EnergyBalance: switching activity level moves the active highlight", () => {
    h = mountViz(createElement(EnergyBalance));
    expectSelectionMoves(h, "Moderate", "Active");
  });

  test("ForceVelocityCurve: switching fiber type moves the active highlight", () => {
    h = mountViz(createElement(ForceVelocityCurve));
    expectSelectionMoves(h, "Fast (Type II)", "Slow (Type I)");
  });

  test("EventLoop: switching scenario moves the active highlight", () => {
    h = mountViz(createElement(EventLoop));
    expectSelectionMoves(h, "setTimeout + Promise", "Promise chain");
  });

  test("RenderPipeline: switching change type moves the active highlight", () => {
    h = mountViz(createElement(RenderPipeline));
    expectSelectionMoves(h, "Reflow", "Composite");
  });

  test("WcagContrast: switching text size moves the active highlight", () => {
    h = mountViz(createElement(WcagContrast));
    expectSelectionMoves(h, "Normal text", "Large text");
  });

  test("GalaxyRotationCurve: switching mode moves the active highlight", () => {
    h = mountViz(createElement(GalaxyRotationCurve));
    expectSelectionMoves(h, "Observed", "Visible mass");
  });

  test("HubbleExpansion: switching H0 preset moves the active highlight", () => {
    h = mountViz(createElement(HubbleExpansion));
    expectSelectionMoves(h, "Planck 67", "SH0ES 73");
  });

  test("CpuScheduler: switching algorithm moves the active highlight", () => {
    h = mountViz(createElement(CpuScheduler));
    expectSelectionMoves(h, "FCFS", "Round-robin");
  });
});
