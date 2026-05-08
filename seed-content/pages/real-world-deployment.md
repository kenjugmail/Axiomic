---
title: Real-World Deployment
category: robotics
---
<!-- tier:intro -->
# Real-World Deployment

The discipline of moving from research demos to production systems.

The gap between "works in the lab" and "works in the field" is enormous. Real-world robots face:

- **Sensor failures**: cameras get dirty, LIDARs see specular returns, IMUs drift.
- **Mechanical wear**: motors degrade, joints develop backlash.
- **Environmental variation**: lighting, weather, obstacles, people.
- **Edge cases**: scenarios not in training data.
- **Safety constraints**: hard limits + verification.
- **Real-time requirements**: latency, throughput, reliability.

Most research robots stay in the lab forever. The few that deploy face concentrated engineering work that's largely invisible in papers.

<!-- tier:undergrad -->
# Real-World Deployment (Undergrad)

## What separates production from research

**Reliability**: research demos work 80% of the time. Production needs 99%+.

**Edge case handling**: production encounters scenarios research never tested.

**Hardware integration**: real motors, sensors, network, power management.

**Safety**: explicit + verified limits.

**Maintenance**: hardware degrades; software needs updates; calibration drifts.

**Deployment infrastructure**: monitoring, logging, remote diagnostics, OTA updates.

These dominate engineering effort post-research.

## Common failure modes

**Sensor failures**:
- Camera lens dirty / occluded.
- LIDAR specular returns from glass + water.
- GPS multipath in urban canyons.
- IMU bias drift over time.

**Software failures**:
- Out-of-memory.
- CPU spikes causing missed deadlines.
- Timing drift between components.
- Bugs in edge-case handling.

**Mechanical failures**:
- Motor stalls + overheating.
- Backlash + wear in joints.
- Cable wear in moving parts.

**Environmental failures**:
- Wet floors confusing autonomous vehicles.
- Reflective surfaces breaking depth sensors.
- Humans behaving unexpectedly.

Production systems plan for all of these.

## Safety + verification

**Hardware safety**:
- Emergency stop buttons.
- Watchdog timers (kill if software hangs).
- Force / torque limits enforced in firmware.
- Hardware-bounded workspace.

**Software safety**:
- Runtime checks (state in valid ranges).
- Behavior monitoring (compare to expected behavior).
- Safe-stop fallback when uncertain.
- Backup classical controller if ML controller fails.

**Verification**:
- Formal verification of low-level controllers (possible).
- Statistical safety guarantees for ML controllers (limited).
- Extensive testing + simulation (always).
- Conservative deployment (limited environments first; expand gradually).

## Monitoring + maintenance

**Telemetry**: log every action, sensor reading, decision. Diagnose failures post-hoc.

**Alerting**: detect anomalies in real-time; alert operators.

**Performance metrics**:
- Task success rate.
- Cycle time.
- Failure modes + frequencies.
- Hardware health (temperatures, currents).

**Remote diagnostics**: operators see + diagnose remotely; reduces field-service costs.

**OTA updates**: software updates without physical access. Standard for autonomous vehicles, drones, service robots.

## Deployment progression

Typical path from research to production:

1. **Lab demo**: works in controlled environment, with researchers present.
2. **Closed beta**: limited deployment in friendly environments.
3. **Pilot**: small-scale production with significant supervision.
4. **Limited GA**: production deployment in narrow scenarios.
5. **General availability**: production deployment broadly.

Each stage uncovers new failure modes. Most projects fail at stage 2-3.

## Where real-world deployment is happening (2026)

**Successfully deployed**:
- Warehouse manipulation (Amazon, Symbotic, Berkshire Grey).
- Service robots in hotels + hospitals (Savioke, Diligent).
- Autonomous taxis in limited geographies (Waymo, Cruise).
- Delivery robots on sidewalks (Starship, Kiwi).
- Industrial assembly (KUKA, ABB, Fanuc).

**Still emerging**:
- Home robots (limited adoption).
- Humanoids (early demos; not production).
- Outdoor autonomous vehicles in unstructured environments.
- General-purpose manipulation in homes.

<!-- tier:grad -->
# Real-World Deployment (Grad)

## Long-tail distribution problems

Real-world data follows long-tail distributions:
- Most situations are common (90% are familiar).
- A few situations are rare but high-impact (the 10% can dominate failure modes).

**Implications**:
- Training data is dominated by common cases.
- Test sets miss rare cases.
- Production failures are usually long-tail.

**Mitigations**:
- Active learning: target rare cases.
- Edge-case mining: from production logs, find anomalies; add to training.
- Synthetic edge-case generation: simulator-augmented data.
- Conservative behavior in OOD: detect unfamiliar; back off.

## OOD detection

Out-of-distribution detection: knowing when the input is unfamiliar so the system can back off.

**Methods**:
- **Reconstruction loss**: VAE reconstructs input; high loss = OOD.
- **Density estimation**: low density under training distribution = OOD.
- **Ensemble disagreement**: multiple models disagree on OOD inputs.
- **Mahalanobis distance**: in feature space.
- **Conformal prediction**: formal coverage guarantees.

For safety-critical robotics, OOD detection is essential. Limited deployment until reliable.

## Continuous learning + drift

Production data drifts:
- Hardware ages.
- Environment changes.
- Tasks evolve.

**Continuous learning**:
- Periodic retraining on production logs.
- Online fine-tuning (with safety constraints).
- A/B testing of policy updates.

**Catastrophic forgetting**: new training overwrites old knowledge.

**Replay buffers**: maintain historical data; replay during retraining.

## Deployment monitoring

What to monitor:

**Performance metrics**:
- Task success rate.
- Cycle time.
- Per-task failure modes.

**Hardware metrics**:
- Motor currents + temperatures.
- Sensor noise levels.
- Calibration drift.

**Software metrics**:
- Inference latency.
- CPU + memory + GPU utilization.
- Network latency.

**Anomaly detection**:
- Statistical thresholds + alerts.
- ML-based anomaly detection.
- Correlation across metrics.

Production teams build dashboards + on-call rotations around these.

## Hardware-software co-design

Production robots optimize hardware + software jointly:

- **Custom inference accelerators**: optimized for the specific policy.
- **Sensor selection**: cost vs reliability tradeoffs.
- **Actuator sizing**: just-enough torque; reliability through margins.
- **Power management**: balance compute + sensors + motors against battery.
- **Maintainability**: modular components, easy replacement.

## Cost engineering

Robot economics:

- **Hardware cost**: bill of materials + assembly.
- **Compute cost**: GPU vs CPU inference; edge vs cloud.
- **Energy cost**: battery + recharge cycles.
- **Maintenance cost**: parts + labor over robot lifetime.
- **Software cost**: development + deployment + updates.
- **Per-unit cost vs fleet cost**: economies of scale.

Production deployments live or die on per-unit economics. A robot that works perfectly but costs $1M doesn't deploy.

## Regulatory + legal

Production deployment in regulated industries:

- **Aerospace**: ARP4754, DO-178C, DO-254. Years of certification.
- **Medical**: FDA, CE marking. Verification + validation requirements.
- **Automotive**: ISO 26262, AUTOSAR. Functional safety.
- **Workplace**: OSHA, ISO standards.

These cost time + money but are non-negotiable for many deployments.

## Production stack examples

**Waymo** (autonomous vehicles):
- HD maps + classical localization.
- ML perception + prediction.
- Classical motion planning + control.
- Extensive simulation + edge-case testing.
- Geofenced deployment.

**Amazon Sparrow** (warehouse manipulation):
- Vision-based grasp prediction.
- Classical motion planning.
- Force feedback for grasp confirmation.
- Conservative behavior on OOD items.

**Boston Dynamics Spot**:
- Hybrid classical + ML control.
- Custom sensors + computer.
- Years of refinement.

These are the production exemplars. Each combines classical control + ML with extensive engineering.

## References

- Borges et al. 2018. *A Survey on Robotic Vehicles' Path Planning Methods for Autonomous Driving*. (Production AV stack.)
- Hadsell et al. 2009-2024 (various). Production-ready robotics from DeepMind.
- Levine, Pastor, Krizhevsky, Quillen 2016. *Learning hand-eye coordination for robotic grasping*. (Early production-style ML grasping at Google.)
- Zhao et al. 2023. *Learning fine-grained bimanual manipulation*. (Open-source teleoperation system.)
- Reports from Waymo, Cruise, Boston Dynamics, Amazon Robotics. Production-deployment lessons.
