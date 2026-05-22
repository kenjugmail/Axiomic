import { describe, expect, test } from "vitest";
import { createElement } from "react";
import { renderViz, assertHasSvg } from "./renderViz";

// Smoke tests for every session-added viz component. Mounts each
// with default props (no controlled overrides), asserts:
//   1. the SSR render does not throw
//   2. the output contains an <svg ...> tag
// These catch the most common regressions: import errors, hook-order
// bugs, prop-type mismatches, and the kind of name-typo that breaks
// the LessonPlayer at runtime.

import { KinshipDiagram } from "../src/components/KinshipDiagram";
import { ForwardKinematicsArm } from "../src/components/ForwardKinematicsArm";
import { GroupOrbits } from "../src/components/GroupOrbits";
import { FriedmannEquation } from "../src/components/FriedmannEquation";
import { SchellingSegregation } from "../src/components/SchellingSegregation";
import { BigFiveRadar } from "../src/components/BigFiveRadar";
import { CivilizationTimeline } from "../src/components/CivilizationTimeline";
import { TruthTable } from "../src/components/TruthTable";
import { VotingSystems } from "../src/components/VotingSystems";
import { ClonalSelection } from "../src/components/ClonalSelection";
import { SamplingTemperatureLab } from "../src/components/SamplingTemperatureLab";
import { CrystalLattice } from "../src/components/CrystalLattice";
import { BrillouinZone } from "../src/components/BrillouinZone";
import { PhononDispersion } from "../src/components/PhononDispersion";
import { PrecedentNetwork } from "../src/components/PrecedentNetwork";
import { ForgettingCurve } from "../src/components/ForgettingCurve";
import { BacterialGrowthCurve } from "../src/components/BacterialGrowthCurve";
import { AlleleFrequencyDrift } from "../src/components/AlleleFrequencyDrift";
import { HarmonicSeries } from "../src/components/HarmonicSeries";
import { ZoningGrid } from "../src/components/ZoningGrid";
import { ExtinctionTimeline } from "../src/components/ExtinctionTimeline";
import { UtilityIndifference } from "../src/components/UtilityIndifference";
import { StructuralLoadFlow } from "../src/components/StructuralLoadFlow";
import { PopulationPyramid } from "../src/components/PopulationPyramid";
import { MapProjections } from "../src/components/MapProjections";
import { ShotComposition } from "../src/components/ShotComposition";
import { KeplerOrbits } from "../src/components/KeplerOrbits";
import { EpidemicCurve } from "../src/components/EpidemicCurve";
import { KoppenClimate } from "../src/components/KoppenClimate";
import { AllianceNetwork } from "../src/components/AllianceNetwork";
import { GrowthChart } from "../src/components/GrowthChart";
import { DoseResponseCurve } from "../src/components/DoseResponseCurve";
import { DnaElectropherogram } from "../src/components/DnaElectropherogram";
import { ComparativeAnatomy } from "../src/components/ComparativeAnatomy";
import { BeatGrid } from "../src/components/BeatGrid";
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

const VIZ_COMPONENTS = {
  KinshipDiagram,
  ForwardKinematicsArm,
  GroupOrbits,
  FriedmannEquation,
  SchellingSegregation,
  BigFiveRadar,
  CivilizationTimeline,
  TruthTable,
  VotingSystems,
  ClonalSelection,
  SamplingTemperatureLab,
  CrystalLattice,
  BrillouinZone,
  PhononDispersion,
  PrecedentNetwork,
  ForgettingCurve,
  BacterialGrowthCurve,
  AlleleFrequencyDrift,
  HarmonicSeries,
  ZoningGrid,
  ExtinctionTimeline,
  UtilityIndifference,
  StructuralLoadFlow,
  PopulationPyramid,
  MapProjections,
  ShotComposition,
  KeplerOrbits,
  EpidemicCurve,
  KoppenClimate,
  AllianceNetwork,
  GrowthChart,
  DoseResponseCurve,
  DnaElectropherogram,
  ComparativeAnatomy,
  BeatGrid,
  VitalSignsMonitor,
  FlavorWheel,
  AirfoilPolar,
  LedgerTAccounts,
  CropYieldResponse,
  SurvivalCurve,
  BtreeVsLsm,
  KeyExchange,
  VirtualMemory,
  CacheHierarchy,
  DagPipeline,
  QuorumReplication,
  ToothAnatomy,
  EnergyBalance,
  ForceVelocityCurve,
  EventLoop,
  RenderPipeline,
  WcagContrast,
  GalaxyRotationCurve,
  HubbleExpansion,
  CpuScheduler,
};

describe("viz components — SSR smoke tests", () => {
  for (const [name, Component] of Object.entries(VIZ_COMPONENTS)) {
    test(`${name} renders without throwing + emits SVG`, () => {
      const html = renderViz(createElement(Component as React.FC));
      assertHasSvg(html);
      expect(html.length).toBeGreaterThan(50);
    });
  }
});
