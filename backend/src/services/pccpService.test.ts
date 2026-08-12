import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  quantizeGrid,
  computeDisplayOrder,
  computeTimingZScore,
  pccpImageUrl,
  PCCP_IMAGE_IDS,
  GRID_SIZE,
} from "./pccpService.js";

describe("pccpService unit tests", () => {
  it("quantizeGrid maps 0..1 to 0..20 grid cells", () => {
    assert.equal(quantizeGrid(0), 0);
    assert.equal(quantizeGrid(0.01), 0);
    assert.equal(quantizeGrid(0.5), 10);
    assert.equal(quantizeGrid(0.999), 20);
    assert.equal(quantizeGrid(1.0), 20);
  });

  it("pccpImageUrl formats valid image paths", () => {
    assert.equal(pccpImageUrl("pccp-1"), "/pccp/pccp-1.png");
    assert.equal(pccpImageUrl("pccp-5"), "/pccp/pccp-5.png");
  });

  it("computeDisplayOrder produces deterministic permutations", () => {
    const images = ["pccp-1", "pccp-3", "pccp-5"];
    const order1 = computeDisplayOrder(images, 12345, 0);
    const order2 = computeDisplayOrder(images, 12345, 0);
    const order3 = computeDisplayOrder(images, 12345, 1);

    assert.deepEqual(order1, order2);
    assert.equal(order1.length, 3);
    // Different attempt index should change the display order shuffle
    assert.notDeepEqual(order1, order3);
  });

  it("computeTimingZScore identifies timing anomalies", () => {
    const baselines = [
      {
        sequencePosition: 0,
        meanTimeToClick: 1000,
        stddevTimeToClick: 100,
        meanInterClick: 0,
        stddevInterClick: 0,
      },
      {
        sequencePosition: 1,
        meanTimeToClick: 800,
        stddevTimeToClick: 80,
        meanInterClick: 500,
        stddevInterClick: 50,
      },
    ];

    const normalSamples = [
      { position: 0, timeToClick: 1050, interClick: 0 },
      { position: 1, timeToClick: 820, interClick: 510 },
    ];
    const { maxZ: normalZ } = computeTimingZScore(baselines, normalSamples);
    assert.ok(normalZ < 1.0, `Expected low z-score, got ${normalZ}`);

    const anomalousSamples = [
      { position: 0, timeToClick: 2500, interClick: 0 }, // 15 stddevs off!
      { position: 1, timeToClick: 800, interClick: 500 },
    ];
    const { maxZ: anomalousZ } = computeTimingZScore(baselines, anomalousSamples);
    assert.ok(anomalousZ > 3.0, `Expected high z-score, got ${anomalousZ}`);
  });
});
