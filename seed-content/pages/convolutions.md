---
title: Convolutions
category: multimodal
---
<!-- tier:intro -->
# Convolutions

A convolution slides a small filter (typically 3×3 or 5×5) across an image, computing a weighted sum at each position. The standard primitive of convolutional neural networks (CNNs).

Two key properties:
- **Translation equivariance**: the same filter is applied at every position. A feature shifted in the input is shifted equivalently in the output.
- **Parameter efficiency**: a 3×3×C_in×C_out filter has 9·C_in·C_out parameters, regardless of image size.

<!-- tier:undergrad -->
# Convolutions (Undergrad)

## The operation

For input `(C_in, H, W)`, filter `(C_out, C_in, kH, kW)`, output `(C_out, H', W')`:

```
output[c, i, j] = Σ_{c', di, dj} filter[c, c', di, dj] · input[c', i+di, j+dj] + bias[c]
```

Plus stride (step between filter positions), padding (zeros around the input), and dilation (gaps in the filter).

## Why it works for images

Images have:
1. **Translation equivariance**: a face is a face whether it's top-left or bottom-right. Same filter everywhere.
2. **Locality**: nearby pixels are correlated; a small filter captures local structure.
3. **Hierarchical structure**: edges → textures → parts → objects. Stack convolutions; the receptive field grows; features become more abstract.

## CNN block

A standard block:

```
input → conv → batchnorm → activation (ReLU/GELU) → conv → batchnorm → activation → maxpool → output
```

ResNet adds residuals: `output += input` skipping over the conv layers. Critical for training 100+ layer networks.

## Implementation: im2col + matmul

Convolutions are implemented as **matmul** under the hood. The `im2col` operation reshapes the input patches into a matrix; the filter is reshaped into another matrix; convolution = matmul. This is what makes convolutions GPU-friendly.

cuDNN picks the right algorithm (direct, FFT, Winograd, or im2col + GEMM) based on filter and input sizes.

<!-- tier:grad -->
# Convolutions (Grad)

## Beyond standard convolutions

- **Depthwise separable**: factor `C_in × C_out × k×k` into `C_in × k×k` (depthwise) + `C_in × C_out × 1×1` (pointwise). Far fewer parameters; same expressive power for many tasks. MobileNet's primitive.
- **Dilated / atrous**: insert gaps in the filter. Increases receptive field without more parameters. Standard in semantic segmentation.
- **Grouped**: split channels into G groups; each group's output uses only its group's input. Reduces compute; ResNeXt + ConvNeXt use this.
- **Deformable**: filter positions are learned, not fixed grid. More flexible; harder to train.

## Receptive field arithmetic

Layer `l`'s receptive field grows: `RF_l = RF_{l-1} + (k - 1) · stride_{l-1}`. After 5 stride-1 3×3 convs, RF = 11×11. After 5 stride-2 convs, RF much larger.

For object detection / segmentation, you need RFs that span the largest object you care about. Either: deeper network, dilated convolutions, attention (which has unlimited receptive field).

## CNNs vs ViTs

CNN inductive bias (translation equivariance + locality) helps at small data scales but limits flexibility at large scales. ViTs have no such bias and need more data. ConvNeXt-style modernized CNNs match ViTs with the right training recipe — showing the inductive bias isn't strictly worse, just different.

For most current applications: ViTs at scale, CNNs when data is limited or inference latency matters. The two architectures are now complementary, not competing.
