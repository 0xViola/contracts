import { expect } from "chai";
import { Contract, BigNumber } from "ethers";
import { ethers } from "hardhat";

import {
  ORDER_TYPE_HASH,
  ORDER_TYPE_FIELDS,
  ORDER_UID_LENGTH,
  OrderKind,
  computeOrderUid,
} from "../src/ts";

import { encodeOrder } from "./encoding";

function fillBytes(count: number, byte: number): string {
  return ethers.utils.hexlify([...Array(count)].map(() => byte));
}

function fillDistinctBytes(count: number, start: number): string {
  return ethers.utils.hexlify(
    [...Array(count)].map((_, i) => (start + i) % 256),
  );
}

describe("GPv2Order", () => {
  let orders: Contract;

  beforeEach(async () => {
    const GPv2Order = await ethers.getContractFactory("GPv2OrderTestInterface");
    orders = await GPv2Order.deploy();
  });

  describe("TYPE_HASH", () => {
    it("matches the EIP-712 order type hash", async () => {
      expect(await orders.typeHashTest()).to.equal(ORDER_TYPE_HASH);
    });
  });

  describe("hash", () => {
    it("computes EIP-712 order struct hash", async () => {
      const order = {
        sellToken: fillBytes(20, 0x01),
        buyToken: fillBytes(20, 0x02),
        receiver: fillBytes(20, 0x03),
        sellAmount: ethers.utils.parseEther("42"),
        buyAmount: ethers.utils.parseEther("13.37"),
        validTo: 0xffffffff,
        appData: ethers.constants.HashZero,
        feeAmount: ethers.utils.parseEther("1.0"),
        kind: OrderKind.SELL,
        partiallyFillable: false,
      };
      expect(await orders.hashTest(encodeOrder(order))).to.equal(
        ethers.utils._TypedDataEncoder.hashStruct(
          "Order",
          { Order: ORDER_TYPE_FIELDS },
          order,
        ),
      );
    });
  });

  describe("packOrderUidParams", () => {
    it("packs the order UID", async () => {
      const orderDigest = fillDistinctBytes(32, 1);
      const owner = ethers.utils.getAddress(fillDistinctBytes(20, 1 + 32));
      const validTo = BigNumber.from(fillDistinctBytes(4, 1 + 32 + 20));
      expect(
        await orders.packOrderUidParamsTest(
          ORDER_UID_LENGTH,
          orderDigest,
          owner,
          validTo,
        ),
      ).to.equal(
        computeOrderUid({
          orderDigest,
          owner,
          validTo: validTo.toNumber(),
        }),
      );
    });

    it("reverts if the buffer length is wrong", async () => {
      await expect(
        orders.packOrderUidParamsTest(
          ORDER_UID_LENGTH + 1,
          ethers.constants.HashZero,
          ethers.constants.AddressZero,
          0,
        ),
      ).to.be.revertedWith("uid buffer overflow");
    });
  });

  describe("extractOrderUidParams", () => {
    it("round trip encode/decode", async () => {
      // Start from 1 so no bytes zeroes.
      const orderDigest = fillDistinctBytes(32, 1);
      const address = ethers.utils.getAddress(fillDistinctBytes(20, 1 + 32));
      const validTo = BigNumber.from(fillDistinctBytes(4, 1 + 32 + 20));

      const orderUid = computeOrderUid({
        orderDigest,
        owner: address,
        validTo: validTo.toNumber(),
      });
      expect(orderUid).to.equal(fillDistinctBytes(32 + 20 + 4, 1));

      const {
        orderDigest: extractedOrderDigest,
        owner: extractedAddress,
        validTo: extractedValidTo,
      } = await orders.extractOrderUidParamsTest(orderUid);
      expect(extractedOrderDigest).to.equal(orderDigest);
      expect(extractedValidTo).to.equal(validTo);
      expect(extractedAddress).to.equal(address);
    });

    describe("fails on uid", () => {
      it("longer than expected", async () => {
        const invalidUid = fillDistinctBytes(ORDER_UID_LENGTH + 1, 0);
        await expect(
          orders.extractOrderUidParamsTest(invalidUid),
        ).to.be.revertedWith("GPv2: invalid uid");
      });

      it("shorter than expected", async () => {
        const invalidUid = fillDistinctBytes(ORDER_UID_LENGTH - 1, 0);
        await expect(
          orders.extractOrderUidParamsTest(invalidUid),
        ).to.be.revertedWith("GPv2: invalid uid");
      });
    });
  });
});