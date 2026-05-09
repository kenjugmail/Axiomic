---
title: Loop Closure
category: robotics
---
<!-- tier:intro -->
# Loop Closure

The recognition that a robot has returned to a previously-visited location. Critical for SLAM correctness over long trajectories.

**Without loop closure**: drift accumulates monotonically; the same physical place appears as multiple separate locations on the map; long-term mapping degrades.

**With loop closure**: when revisits occur, a constraint is added connecting the current pose to the prior visit's pose. Re-solving the SLAM optimization redistributes accumulated error across the trajectory.

**Three components**:
1. **Detection**: recognize the revisit from sensor data.
2. **Verification**: confirm the match (avoid false positives from perceptual aliasing).
3. **Correction**: add the constraint + re-optimize.

<!-- tier:undergrad -->
# Loop Closure (Undergrad)

## Why it's essential

Drift is universal in SLAM. Every step adds estimation error. Pure odometry (motion-only) drifts ~1-5% of distance traveled — a robot that walks 100m has 1-5m positional error.

After hours of operation, the map becomes a tangled mess. Loop closure is the global consistency mechanism that anchors the trajectory back to known reference points.

## Detection: visual loop closure

**Bag-of-words (BoW)**:
- Extract features (ORB, SIFT) from each image.
- Quantize into a vocabulary of "visual words".
- Compare current image's word histogram to past images' histograms.
- Top matches are loop-closure candidates.

DBoW2, DBoW3 are standard implementations.

**Aggregated descriptors (VLAD, NetVLAD)**:
- Pool features into a fixed-length vector.
- Compare via cosine similarity.
- More efficient than BoW for very large databases.

**Deep features**:
- SuperPoint + SuperGlue: learned features + learned matching.
- DELF, NetVLAD: learned global descriptors.
- DINOv2-based: foundation-model features for place recognition.

## Detection: LIDAR loop closure

**Scan-context**: bird's-eye-view descriptor of LIDAR scan. Encode height + reflectivity in concentric rings. Compare via efficient distance.

**LiDAR-Iris**: another LIDAR-based descriptor for place recognition.

**Place recognition with deep learning**: trained on labeled re-visit data; produces embeddings for matching.

## Verification

Detection has false positives: two different places that look similar (perceptual aliasing). Examples:
- Two corridors that look identical.
- A symmetric building.
- Repetitive textures (parking lots, regular facades).

**Geometric verification**:
1. Take detected candidate pair.
2. Match features between them.
3. Estimate relative pose via RANSAC.
4. If enough inliers + small reprojection error → accept.

**Visual + geometric**: both descriptors match AND geometric verification passes. Standard practice.

## Correction

Once verified:
1. Add a factor connecting the two poses with the relative-pose measurement.
2. Re-optimize the factor graph.
3. Error redistributes across the trajectory.

The redistribution is the magic: error that accumulated linearly between the two visits is corrected globally.

## Failure modes

**Missed loops** (false negatives):
- Place recognition fails (different angle, different lighting, occlusion).
- Drift unbounded; map quality degrades over long trajectories.
- Mitigation: aggressive detection + many candidates.

**False loops** (false positives):
- Two different places look identical.
- Catastrophic: optimizer corrupts the map.
- Mitigation: strict verification; sequential consistency checks; outlier-robust optimization.

Production SLAM tunes detection + verification carefully to balance these. Aggressive detection + careful verification is the typical formula.

<!-- tier:grad -->
# Loop Closure (Grad)

## Probabilistic formulation

Loop closure as Bayesian inference: given observations + map, compute `P(loop_closure | data)`.

Two hypotheses:
- **Loop**: current observation matches past location.
- **No loop**: novel place.

Posterior odds: `P(loop)/P(no loop) × P(data|loop)/P(data|no loop)`.

The first ratio: prior on visiting old places (high in indoor environments, low in outdoor).
The second: similarity ratio (likelihood ratio test).

**FAB-MAP** (Cummins-Newman 2008): explicit probabilistic appearance-based loop-closure detection. Uses Chow-Liu tree to model word co-occurrence. Robust to perceptual aliasing.

## Robust optimization

False loops are catastrophic for naive optimization. Robust formulations:

**Robust kernels** (Huber, Cauchy, Geman-McClure): replace squared residuals with kernels that down-weight outliers. Standard.

**Switchable Constraints (SC)**: each loop-closure factor has a switch variable; optimization can deactivate it. Sünderhauf-Protzel 2012.

**Max-Mixtures (MM)**: each factor is a max-mixture of two Gaussians (one for "valid", one for "outlier"). Olson-Agarwal 2013.

**Pairwise Consistent Measurements (PCM)**: select largest set of mutually consistent loop closures via graph theory. Mangelson-Dominic-Eustice-Vasudevan 2018.

These methods enable production SLAM to tolerate occasional false loop closures without map corruption.

## Sequence-based verification

Single-image place recognition is fragile. **Sequential consistency**: if both `t` and `t+1` match prior frames `t'` and `t'+1` respectively, much higher confidence.

**SeqSLAM** (Milford-Wyeth 2012): match sequences instead of single frames. Robust to lighting + season changes.

Modern visual loop closure increasingly uses sequence-level matching.

## Multi-session SLAM

When the robot starts a new session in a previously-mapped area:

- Bootstrap localization in the prior map (one-shot place recognition).
- Continue mapping while merging into the prior map.
- Detect map changes (new objects, removed objects).

Active research; production solutions are limited.

## Topological loop closure

Sometimes only topological (graph-level) loop closure is needed: "we're back in room X" without metric pose.

Used in:
- Topological mapping (rooms + connections, no metric).
- Hybrid metric-topological SLAM.
- High-level navigation in known environments.

## Connection to image retrieval

Visual loop closure = image retrieval problem. The literature on content-based image retrieval (BoW, VLAD, deep features, DINOv2-based) directly applies.

The retrieval-vs-recognition distinction matters: retrieval ranks similar images; recognition decides if a match exists. Loop closure needs both.

## Deep learning + foundation models

Modern systems use:
- **Pretrained vision foundation models** (DINOv2, CLIP) as feature extractors.
- **Trained place-recognition models** (NetVLAD, MixVPR, Eigenplaces).
- **End-to-end loop-closure networks**: take raw images + output match probability + pose offset.

Production systems still combine learned features with classical geometric verification.

## References

- Cummins & Newman 2008. FAB-MAP: probabilistic localization and mapping in the space of appearance. *IJRR*.
- Galvez-López & Tardós 2012. Bags of binary words for fast place recognition in image sequences. *IEEE T. Robot.*
- Sünderhauf & Protzel 2012. Switchable constraints for robust pose graph SLAM. *IROS*.
- Milford & Wyeth 2012. SeqSLAM. *ICRA*.
- Arandjelović et al. 2016. NetVLAD: CNN architecture for weakly supervised place recognition. *CVPR*.
