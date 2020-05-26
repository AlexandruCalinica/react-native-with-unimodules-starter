import * as tf from '@tensorflow/tfjs-core';

import { depthwiseSeparableConv } from '../common';
import { NetInput, toNetInput } from '../dom';
import { NeuralNetwork } from '../NeuralNetwork';
import { normalize } from '../ops';
import { range } from '../utils';
import { extractParams } from './extractParams';
import { extractParamsFromWeigthMap } from './extractParamsFromWeigthMap';

/**
 *
 * @param {'tf.Tensor4D'} x
 * @param {'ConvParams'} params
 * @param {'[number, number]'} stride
 * @returns {'Tensor<Rank.R4>'}
 */
function conv(x, params, stride) {
  return tf.add(tf.conv2d(x, params.filters, stride, 'same'), params.bias)
}

/**
 *
 * @param {'tf.Tensor4D'} x
 * @param {'ReductionBlockParams'} params
 * @param {boolean} isActivateInput
 * @returns {'Tensor<Rank.R4> | tf.Tensor4D'}
 */
function reductionBlock(x, params, isActivateInput = true) {
  let out = isActivateInput ? tf.relu(x) : x;
  out = depthwiseSeparableConv(out, params.separable_conv0, [1, 1]);
  out = depthwiseSeparableConv(tf.relu(out),  params.separable_conv1, [1, 1]);
  out = tf.maxPool(out, [3, 3], [2, 2], 'same');
  out = tf.add(out, conv(x,  params.expansion_conv, [2, 2]));
  return out
}

/**
 *
 * @param {'tf.Tensor4D'} x
 * @param {'MainBlockParams'} params
 * @returns {'tf.Tensor4D'}
 */
function mainBlock(x, params) {
  let out = depthwiseSeparableConv(tf.relu(x), params.separable_conv0, [1, 1]);
  out = depthwiseSeparableConv(tf.relu(out), params.separable_conv1, [1, 1]);
  out = depthwiseSeparableConv(tf.relu(out), params.separable_conv2, [1, 1]);
  out = tf.add(out, x);
  return out
}

/**
 * Class representing a TinyException
 * @extends 'NeurolNetwork'
 */
export class TinyXception extends NeuralNetwork {
  /**
   *
   * @param {number} numMainBlocks
   */
  constructor(numMainBlocks) {
    super('TinyXception');
    this._numMainBlocks = numMainBlocks
  }

  /**
   *
   * @public
   * @param {NetInput} input
   * @returns {'Tensor<Rank.R4>'}
   */
  forwardInput(input) {

    const { params } = this;

    if (!params) {
      throw new Error('TinyXception - load model before inference')
    }

    return tf.tidy(() => {
      const batchTensor = input.toBatchTensor(112, true);
      const meanRgb = [122.782, 117.001, 104.298];
      const normalized = normalize(batchTensor, meanRgb).div(tf.scalar(256));

      let out = tf.relu(conv(normalized, params.entry_flow.conv_in, [2, 2]));
      out = reductionBlock(out, params.entry_flow.reduction_block_0, false);
      out = reductionBlock(out, params.entry_flow.reduction_block_1);

      range(this._numMainBlocks, 0, 1).forEach((idx) => {
        out = mainBlock(out, params.middle_flow[`main_block_${idx}`])
      });

      out = reductionBlock(out, params.exit_flow.reduction_block);
      out = tf.relu(depthwiseSeparableConv(out, params.exit_flow.separable_conv, [1, 1]));
      return out
    })
  }

  /**
   * @public
   * @async
   * @param {'TNetInput'} input
   * @returns {'Promise<Tensor<Rank.R4>>'}
   */
  async forward(input) {
    return this.forwardInput(await toNetInput(input))
  }

  /**
   * @protected
   * @returns {string}
   */
  getDefaultModelName() {
    return 'tiny_xception_model'
  }

  /**
   * @protected
   * @param {'tf.NamedTensorMap'} weightMap
   * @returns {*}
   */
  extractParamsFromWeigthMap(weightMap) {
    return extractParamsFromWeigthMap(weightMap, this._numMainBlocks)
  }

  /**
   * @protected
   * @param {Float32Array} weights
   * @returns {*}
   */
  extractParams(weights) {
    return extractParams(weights, this._numMainBlocks)
  }
}
