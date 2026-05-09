---
title: SLAM (Simultaneous Localization and Mapping)
category: robotics
---
<!-- tier:intro -->
# SLAM

Simultaneous Localization and Mapping. A robot moving through an unknown environment must simultaneously:

1. **Build a map** of the environment.
2. **Localize itself** within that map.

These problems are coupled: to map, you need to know where you are; to localize, you need a map. SLAM solves them jointly.

**Why hard**:
- Sensor noise compounds → drift.
- Loop closure (recognizing revisited places) is essential but tricky.
- Real-time constraints.
- Sensor heterogeneity (cameras, LIDAR, IMU, depth).

**Modern SLAM**: factor-graph optimization with sparse solvers + visual / LIDAR loop closure. Production systems like ORB-SLAM3, Cartographer, FAST-LIO, VINS-Fusion are mature.

<!-- tier:undergrad -->
# SLAM (Undergrad)

## SLAM ingredients

**Sensors**: cameras (mono / stereo / RGB-D), LIDAR (2D / 3D), IMU, GPS, wheel odometry. Most production systems use multiple.

**Front-end**: extracts measurements from raw sensor data.
- Visual: feature extraction + matching (ORB, SIFT, SuperPoint).
- LIDAR: point-cloud registration (ICP, NDT, scan-matching).
- IMU: pre-integration of high-rate measurements.

**Back-end**: estimates trajectory + map from front-end measurements.
- Filter-based: EKF-SLAM (legacy).
- Optimization-based: factor graphs (modern standard).

**Loop closure**: recognizes when the robot returns to a previously-visited location. Adds a constraint to the optimization. Anchors the trajectory globally.

**Map representation**: occupancy grid (2D), point cloud (3D), mesh, NeRF / Gaussian Splatting (neural), feature map (sparse).

## EKF-SLAM (legacy)

Joint state vector: robot pose + all landmarks. Apply EKF.

**Limit**: `O(N²)` per update where `N` is landmark count. Doesn't scale beyond hundreds of landmarks. Used in textbooks; rarely in production.

## Modern: factor-graph optimization

State: trajectory poses + landmark positions.

Constraints (factors):
- Odometry: pose `i` → pose `i+1` from motion model.
- Landmark observations: pose `i` → landmark `j` from sensor.
- Loop closures: pose `i` → pose `j` (revisit).
- Prior: initial pose constraint.

Solve maximum-a-posteriori (MAP) via nonlinear least squares:
`X̂ = argmin_X Σᵢ ||r_i(X)||²_{Σᵢ}`

Levenberg-Marquardt or Gauss-Newton. Sparse Jacobians enable efficient solvers (Cholesky, QR).

**Tooling**: GTSAM, g2o, Ceres Solver. All production-grade.

**Why factor graphs win**:
- **Sparse** (each factor connects few variables).
- **Modular** (add new sensor = add new factor).
- **Loop closure handled naturally**.
- **Real-time** with incremental solvers (iSAM, iSAM2).

## Loop closure

Critical for long trajectories. Without it, drift accumulates → map becomes inconsistent (same physical place appears as multiple separate locations).

**Detection**:
- **Visual loop closure**: bag-of-words (DBoW), VLAD, NetVLAD; deep features (DELF, SuperPoint).
- **LIDAR loop closure**: scan-context, LiDAR-Iris, place recognition.

**Verification**: detected loops can be wrong (perceptual aliasing). RANSAC + geometric checks confirm.

**Correction**: add a factor; resolve the optimization. Error redistributes across the trajectory.

**Failure modes**:
- Missed loops → drift unbounded.
- False loops → map corrupted catastrophically.

## Modern systems

**ORB-SLAM3**: feature-based visual SLAM. Mono / stereo / RGB-D. Open source.
**Cartographer (Google)**: 2D + 3D LIDAR SLAM. Industrial-strength.
**LIO-SAM, FAST-LIO**: LIDAR + IMU. Modern; very accurate.
**LeGO-LOAM**: LIDAR odometry + mapping with ground segmentation.
**VINS-Fusion**: visual-inertial. Open source; strong.
**Neural SLAM**: NICE-SLAM, NeRF-SLAM, Gaussian-Splatting SLAM.

The "best" choice depends on sensors, environment, computational budget. No universal winner.

<!-- tier:grad -->
# SLAM (Grad)

## Theoretical foundations

SLAM as MAP estimation:
`X̂ = argmax_X p(X | Z) = argmax_X p(Z | X) p(X)`

With Gaussian noise + uninformative prior:
`X̂ = argmin_X (Z - h(X))ᵀ Σ⁻¹ (Z - h(X))`

This is nonlinear least squares. Levenberg-Marquardt or Gauss-Newton.

**Why factor graphs**: the Jacobian + Hessian are sparse (each measurement constrains few variables); sparse linear solvers are `O(N log N)` or better.

**Smoothing vs filtering**:
- **Filtering** (EKF-SLAM): only current pose + landmarks; recursive; `O(N²)` per step.
- **Smoothing** (factor graph): all poses + landmarks; batch; sparse.

Smoothing is more accurate (re-linearizes everything at each iteration). Filtering is recursive (no need to store history).

Modern SLAM uses incremental smoothing (iSAM, iSAM2): re-solve only the part of the graph affected by new measurements. Fast + accurate.

## Visual SLAM details

**Feature-based** (ORB-SLAM3, etc.):
- Extract sparse features (ORB, SIFT).
- Match across frames.
- Estimate camera pose via PnP.
- Triangulate landmarks.
- Bundle adjustment (joint optimization of poses + landmarks).

**Direct** (DSO, DTAM):
- No features; minimize photometric error directly.
- Higher accuracy; lower robustness.
- Requires good initialization.

**Semi-direct** (SVO):
- Hybrid; features for initialization + tracking, photometric for refinement.

**Deep features**: SuperPoint, SuperGlue, LoFTR — learned features more robust than handcrafted.

## LIDAR SLAM details

**Scan matching**:
- ICP (Iterative Closest Point): align two point clouds.
- NDT (Normal Distributions Transform): voxel-grid representation.
- GICP (Generalized ICP): plane-to-plane.

**Scan-context**: bird's-eye-view descriptor for place recognition.

**LIDAR + IMU**: high-rate IMU pre-integration + low-rate LIDAR scan matching. The standard production stack.

## Visual-inertial SLAM

Adds IMU constraints to visual SLAM:
- IMU pre-integration: integrates accelerometer + gyro between frames.
- Adds factors connecting consecutive poses with IMU residuals.
- Estimates IMU bias online.

VINS-Fusion, OKVIS, Kimera are visual-inertial. Aerospace + drones use them heavily.

## Long-term + lifelong SLAM

Map maintenance over hours, days, months:

- **Map drift**: small inaccuracies compound.
- **Dynamic environments**: things change (people, furniture, vehicles).
- **Memory**: maps grow; need pruning.
- **Multi-session SLAM**: robot starts a new session; recognizes the prior map.

Active research; production-quality solutions are rare.

## Neural SLAM

Recent: use neural representations as the map.

- **NeRF-SLAM**: replace explicit map with a NeRF; optimize jointly with poses.
- **Gaussian Splatting SLAM**: replace map with 3D Gaussians; very fast rendering.
- **iMAP, NICE-SLAM**: neural-implicit map representation.

**Trade-offs**: neural maps are dense + photorealistic but expensive to train + maintain. Useful for some applications (AR / VR), not yet for production navigation.

## References

- Durrant-Whyte & Bailey 2006. Simultaneous localization and mapping. *IEEE RAM*. (Survey.)
- Dellaert & Kaess. *Factor Graphs for Robot Perception* (2017). Modern standard.
- Cadena et al. 2016. Past, present, and future of simultaneous localization and mapping. *IEEE T. Robot.*
- Mur-Artal & Tardós 2017. ORB-SLAM2. *IEEE T. Robot.*
- Hess et al. 2016. Real-Time Loop Closure in 2D LIDAR SLAM. *ICRA*. (Cartographer.)
