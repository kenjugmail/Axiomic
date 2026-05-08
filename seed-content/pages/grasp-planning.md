---
title: Grasp Planning
category: robotics
---
<!-- tier:intro -->
# Grasp Planning

The problem of choosing where + how to grip an object so that picking it up succeeds.

**Inputs**: object geometry (mesh / point cloud / RGB-D image), gripper type, scene (other objects, occlusions).

**Output**: grasp pose (gripper position + orientation + width / finger configuration).

**Two paradigms**:
- **Classical**: form-closure / force-closure analysis on geometric models.
- **ML-based**: trained on grasp datasets; predicts grasp success from images / point clouds.

Modern production: ML-based with classical fallbacks. Used in Amazon warehouses (Sparrow, Robin), Boston Dynamics' Stretch, autonomous-bin-picking startups.

<!-- tier:undergrad -->
# Grasp Planning (Undergrad)

## Force closure + form closure

**Form closure**: contact points geometrically constrain the object so it can't move at all. Strong but rare in practice (requires many contact points).

**Force closure**: contact points + friction can resist any external wrench (force + torque). Standard for parallel-jaw grippers + multi-finger hands.

**Friction cone**: at each contact, the friction force lies within a cone of directions (friction-coefficient-dependent). Force closure means the union of all force cones spans the wrench space.

**Computation**: linear-programming formulation. Polynomial time.

For hand-engineered grasping, force closure is the design objective. For ML-based grasping, force closure is implicit in the data.

## Classical grasp synthesis

Pre-2015 era. Pipeline:

1. Segment object from scene.
2. Estimate object pose (often via point-cloud registration or model matching).
3. Generate candidate grasps from a database of known grasps for the object class.
4. Score by force-closure + reachability + clearance.
5. Pick highest-scoring grasp.

**Strengths**: principled; works well for known geometries.

**Weaknesses**: doesn't generalize to novel objects; pose estimation is fragile; cluttered scenes confuse it.

## Dex-Net + ML-based grasping

Dex-Net (Mahler et al. 2017+): trained CNN to predict grasp success from depth images.

**Procedure**:
1. Take depth image of scene.
2. Sample candidate grasps (oriented rectangles in the image).
3. Score each with the CNN (probability of success).
4. Execute highest-scoring grasp.

**Training data**: synthetic grasps simulated in physics simulator with thousands of object models. ~6.7M grasps in Dex-Net 2.0.

**Strengths**:
- Generalizes to novel objects.
- Works on cluttered scenes.
- No object-specific engineering.

**Weaknesses**:
- Limited to 4-DoF (planar) grasps.
- Sim-to-real gap.
- Brittle on unusual object shapes.

## 6-DoF grasping

Modern: predict 6-DoF grasps (full 3D pose, not just 2D rectangle).

**6-DoF GraspNet** (Mousavian et al. 2019): VAE-based generative model of grasps + classifier. Outputs many candidate grasps per object; classifier scores them.

**ContactGraspNet** (Sundermeyer et al. 2021): predicts grasp contact points directly. Faster + more accurate than 6-DoF GraspNet.

**Diffusion-based grasping**: model the distribution of successful grasps; sample from it. State-of-the-art on unstructured-clutter benchmarks as of 2026.

## Production realities

Modern grasping systems combine:

- **Vision foundation models** (DINOv2, CLIP) for scene understanding.
- **Trained grasp predictors** for candidate generation.
- **Classical IK + motion planning** for execution.
- **Force / tactile feedback** for grasp adjustment.

**Where it works**: novel objects in cluttered bins. Amazon Sparrow does this in fulfillment centers.

**Where it struggles**: very small or very large objects, transparent / specular objects (depth sensors fail), deformable objects (cloth, food), tools / handles (need specific grasp configurations).

<!-- tier:grad -->
# Grasp Planning (Grad)

## Wrench-space analysis

**Wrench**: 6-vector of force + torque applied to the object.

**Wrench space**: 6-dimensional space of all possible wrenches.

**Force-closure** = the convex hull of friction cones at contact points spans an open ball around origin in wrench space.

**Wrench resistance** quantifies how much external wrench the grasp can resist before failing.

**Quality metrics**:
- Largest ball in wrench space (Ferrari-Canny).
- Volume of grasp polytope.
- Smallest singular value of grasp matrix.

These metrics are used as labels in ML grasp training + as evaluation criteria.

## Multi-finger + dexterous grasping

Beyond parallel-jaw grippers: multi-finger hands (Allegro, Shadow, dexterous hands).

**Challenges**:
- Combinatorial: which fingers contact where?
- High-dimensional grasp configuration.
- Contact dynamics matter more (slipping, rolling).
- Dexterous re-grasping after initial pickup.

**Methods**:
- Optimization over finger configurations + contact points.
- RL for dexterous manipulation (OpenAI Dactyl, ANYmal-Hand).
- Imitation from demos with multi-finger hands.

Production multi-finger systems are rare (research labs + a few startups).

## Tactile-augmented grasping

Vision alone isn't enough for some tasks (small objects, textured surfaces, slippery materials).

**Tactile sensors**:
- **GelSight / DIGIT**: high-resolution tactile imaging via gel-deforming surface + camera.
- **TacTip**: bio-inspired pin arrays.
- **Resistive arrays**: traditional pressure-sensitive arrays.

**Tactile-augmented grasping**:
- Pre-grasp: vision-based candidate generation.
- During grasp: tactile feedback adjusts finger pose + force.
- Post-grasp: tactile-based slip detection; re-grasp if slipping.

Active research; production deployment limited but growing.

## Sim-to-real for grasping

Massive synthetic-data training is the ML-grasping standard. Sim-to-real gaps:

- **Object models**: synthetic objects don't match real distributions.
- **Friction**: simulator models miss real contact behavior.
- **Lighting / texture**: depth sensors behave differently.

**Mitigation**:
- Domain randomization across many objects + physics.
- Photorealistic rendering (NVIDIA's Omniverse).
- Real-data fine-tuning.

Modern systems: pretrain on millions of synthetic grasps; fine-tune on tens of thousands of real ones.

## Foundation-model grasping

VLAs (Vision-Language-Action) handle grasping as part of broader manipulation:

- RT-2: high-level task → end-to-end actions including grasp pose.
- OpenVLA + π-0: end-to-end grasp + manipulation.

**Trade-off**: foundation-model grasping is more flexible but less precise than specialized grasp predictors. Production systems often use a fast specialized grasp predictor + a foundation model for high-level decisions.

## Benchmarks

- **Grasp benchmark** (Calli et al.): standard objects + protocols.
- **YCB Object Set**: 77 objects; widely used.
- **Dex-Net 2.0 / 3.0 datasets**: synthetic + real grasp data.
- **GraspNet-1Billion**: 1 billion grasp annotations.

These benchmarks have largely been saturated; the field is moving to harder settings (cluttered bins, novel objects, dexterous manipulation).

## References

- Mahler et al. 2017. Dex-Net 2.0: Deep learning to plan robust grasps. *RSS*.
- Mousavian et al. 2019. 6-DOF GraspNet. *ICCV*.
- Sundermeyer et al. 2021. Contact-GraspNet. *ICRA*.
- Bicchi & Kumar 2000. Robotic grasping and contact: a review. *ICRA*.
- Sahbani, El-Khoury, Bidaud 2012. An overview of 3D object grasp synthesis algorithms.
