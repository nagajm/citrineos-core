// SPDX-FileCopyrightText: 2026 Zappo
//
// SPDX-License-Identifier: Apache-2.0

import type {
  AuthorizationDto,
  AuthorizationStatusEnumType,
  BootstrapConfig,
  IAuthorizer,
  IMessageContext,
} from '@citrineos/base';
import { AuthorizationStatusEnum } from '@citrineos/base';
import { DefaultSequelizeInstance } from '@dal/index.js';
import { QueryTypes } from 'sequelize';
import { Logger } from 'tslog';
import type { ILogObj } from 'tslog';

interface RfidTagRow {
  id: number;
  operatorId: number | null;
  linkedDriverId: string | null;
  isActive: boolean;
}

interface StationOperatorRow {
  operatorId: number;
  minStartBalance: string;
  pricePerKwh: string;
}

interface PricingOverrideRow {
  pricingMode: string;
  discountType: string | null;
  discountValue: string | null;
}

interface WalletRow {
  balance: string;
}

/**
 * Zappo-specific: gates OCPP Authorize decisions for RFID test cards (station-owner
 * and super-admin cards; see Notes/rfid-test-cards-and-pricing-plan.md). Only engages
 * when the presented idToken matches a row in zappo_rfid_tags — every other idToken
 * (regular drivers, vehicles) falls through with its status untouched, so this can
 * never regress anything already working.
 *
 * zappo_rfid_tags and driver_pricing_overrides are ev-csms-api's tables, created via
 * its own onModuleInit, but they live in the same shared Postgres database CitrineOS
 * already connects to — queried here directly rather than over a network call, since
 * Authorize is on the OCPP request path and needs to stay fast.
 */
export class ZappoRfidPricingAuthorizer implements IAuthorizer {
  private readonly logger: Logger<ILogObj>;
  private readonly config: BootstrapConfig;

  constructor(config: BootstrapConfig, logger?: Logger<ILogObj>) {
    this.config = config;
    this.logger = logger
      ? logger.getSubLogger({ name: this.constructor.name })
      : new Logger<ILogObj>({ name: this.constructor.name });
  }

  async authorize(
    authorization: AuthorizationDto,
    context: IMessageContext,
  ): Promise<AuthorizationStatusEnumType> {
    const currentStatus = authorization.status as AuthorizationStatusEnumType;
    // getInstance requires config on every call, but only actually creates a new
    // connection the first time — subsequent calls (including from other modules)
    // just return the already-initialized shared instance.
    const sequelize = DefaultSequelizeInstance.getInstance(this.config, this.logger);

    let tag: RfidTagRow | undefined;
    try {
      const tags = await sequelize.query<RfidTagRow>(
        `SELECT id, "operatorId", "linkedDriverId", "isActive" FROM zappo_rfid_tags WHERE "idToken" = :idToken LIMIT 1`,
        { replacements: { idToken: authorization.idToken }, type: QueryTypes.SELECT },
      );
      tag = tags[0];
    } catch (error) {
      // Table missing / connection hiccup / etc. — this check simply doesn't apply.
      // Never let an infrastructure error here block a driver unrelated to this feature.
      this.logger.error('ZappoRfidPricingAuthorizer: card lookup failed, skipping', error);
      return currentStatus;
    }

    if (!tag) {
      // Not one of our RFID test cards — leave the existing decision untouched.
      return currentStatus;
    }

    // From here on we know this IS one of our cards — fail closed on any error below,
    // since silently granting Accepted on a broken check could mean free or
    // wrong-priced charging.
    try {
      if (!tag.isActive) {
        this.logger.warn(`Zappo RFID card ${authorization.idToken} is deactivated`);
        return AuthorizationStatusEnum.Blocked;
      }

      const stationRows = await sequelize.query<StationOperatorRow>(
        `SELECT sa."operatorId" AS "operatorId", o."minStartBalance" AS "minStartBalance",
                COALESCE(sa."pricePerKwh", ph."pricePerKwh", 0) AS "pricePerKwh"
         FROM "ChargingStations" cs
         JOIN station_assignments sa ON sa."chargingStationId" = cs.id
         JOIN operators o ON sa."operatorId"::text = o.id::text
         LEFT JOIN LATERAL (
           SELECT "pricePerKwh" FROM price_history
           WHERE "operatorId" = sa."operatorId"
           ORDER BY "effectiveFrom" DESC LIMIT 1
         ) ph ON true
         WHERE cs."ocppConnectionName" = :ocppConnectionName
         LIMIT 1`,
        { replacements: { ocppConnectionName: context.ocppConnectionName }, type: QueryTypes.SELECT },
      );

      if (!stationRows.length) {
        this.logger.warn(`No operator assignment found for station ${context.ocppConnectionName}`);
        return AuthorizationStatusEnum.Blocked;
      }
      const { operatorId: stationOperatorId, minStartBalance, pricePerKwh } = stationRows[0];

      // Station scoping: a card tied to one operator can't be used at a different
      // operator's station. Super-admin cards (operatorId null) always pass this check.
      if (tag.operatorId && tag.operatorId !== stationOperatorId) {
        this.logger.warn(
          `RFID card ${authorization.idToken} is scoped to operator ${tag.operatorId}, ` +
            `rejected at station ${context.ocppConnectionName} (operator ${stationOperatorId})`,
        );
        return AuthorizationStatusEnum.Blocked;
      }

      if (!tag.linkedDriverId) {
        // Registered but never claimed by a driver from their own authenticated
        // session — not chargeable yet. See the plan doc's consent boundary.
        this.logger.warn(`RFID card ${authorization.idToken} has not been claimed by a driver yet`);
        return AuthorizationStatusEnum.Blocked;
      }

      // Resolve the effective rate: driver_pricing_overrides for (driver, station's
      // operator), falling back to the operator's standard rate. Floored at 0.
      const overrides = await sequelize.query<PricingOverrideRow>(
        `SELECT "pricingMode", "discountType", "discountValue" FROM driver_pricing_overrides
         WHERE "driverId" = :driverId AND "operatorId" = :operatorId LIMIT 1`,
        {
          replacements: { driverId: tag.linkedDriverId, operatorId: stationOperatorId },
          type: QueryTypes.SELECT,
        },
      );

      const standardRate = Number(pricePerKwh) || 0;
      let effectiveRate = standardRate;
      if (overrides.length && overrides[0].pricingMode === 'discounted') {
        const value = Number(overrides[0].discountValue) || 0;
        effectiveRate =
          overrides[0].discountType === 'percent'
            ? standardRate * (1 - value / 100)
            : standardRate - value;
        effectiveRate = Math.max(0, effectiveRate);
      }

      if (effectiveRate === 0) {
        // Free session — never touches the wallet, so no balance check applies.
        return AuthorizationStatusEnum.Accepted;
      }

      const wallets = await sequelize.query<WalletRow>(
        `SELECT balance FROM wallets WHERE "driverId" = :driverId LIMIT 1`,
        { replacements: { driverId: tag.linkedDriverId }, type: QueryTypes.SELECT },
      );
      const balance = wallets.length ? Number(wallets[0].balance) : 0;
      const minBalance = Number(minStartBalance) || 50;

      if (balance < minBalance) {
        this.logger.warn(
          `RFID card ${authorization.idToken}: driver ${tag.linkedDriverId} wallet balance ` +
            `₹${balance} below operator's minStartBalance ₹${minBalance}`,
        );
        return AuthorizationStatusEnum.Blocked;
      }

      return AuthorizationStatusEnum.Accepted;
    } catch (error) {
      this.logger.error(
        `ZappoRfidPricingAuthorizer: validation failed for card ${authorization.idToken}`,
        error,
      );
      return AuthorizationStatusEnum.Blocked;
    }
  }
}
