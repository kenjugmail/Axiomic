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
