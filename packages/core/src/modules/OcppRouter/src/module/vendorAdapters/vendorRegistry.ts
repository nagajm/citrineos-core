// SPDX-FileCopyrightText: 2026 Zappo
//
// SPDX-License-Identifier: Apache-2.0

import type { BootstrapConfig } from '@citrineos/base';
import { DefaultSequelizeInstance } from '@dal/index.js';
import { QueryTypes } from 'sequelize';
import type { Logger } from 'tslog';
import type { ILogObj } from 'tslog';

// Known non-standard-OCPP vendors this server has an adaptor for. A future vendor is added
// here plus its own vendor_measurand_mappings rows (ev-csms-api) — no other code changes,
// and every other vendor's traffic is completely unaffected by any of this.
export const KNOWN_VENDOR_IDS = new Set(['ZappoEarth', 'Bolt.Earth']);

const vendorCache = new Map<string, string>(); // ocppConnectionName -> chargePointVendor

export async function getVendorForConnection(
  ocppConnectionName: string,
  config: BootstrapConfig,
  logger: Logger<ILogObj>,
): Promise<string | undefined> {
  const cached = vendorCache.get(ocppConnectionName);
  if (cached) return cached;
  try {
    const sequelize = DefaultSequelizeInstance.getInstance(config, logger);
    const rows = await sequelize.query<{ chargePointVendor: string }>(
      `SELECT "chargePointVendor" FROM "ChargingStations" WHERE "ocppConnectionName" = :name LIMIT 1`,
      { replacements: { name: ocppConnectionName }, type: QueryTypes.SELECT },
    );
    const vendor = rows[0]?.chargePointVendor;
    if (vendor) vendorCache.set(ocppConnectionName, vendor);
    return vendor;
  } catch (error) {
    logger.error('vendorRegistry: failed to resolve chargePointVendor, skipping', error);
    return undefined;
  }
}

export interface MeasurandMappingRow {
  vendorMeasurand: string;
  standardMeasurand: string | null;
  targetPhase: string | null;
  valueMultiplier: string | null;
  targetUnit: string | null;
}

const mappingCache = new Map<string, { rows: MeasurandMappingRow[]; fetchedAt: number }>();
// DB-driven means a new/changed mapping shouldn't need a deploy — this just bounds how long
// the OCPP hot path goes between checking. 5 minutes balances that against a DB query per
// unrecognized measurand.
const MAPPING_CACHE_TTL_MS = 5 * 60 * 1000;

export async function getMeasurandMappings(
  vendorId: string,
  config: BootstrapConfig,
  logger: Logger<ILogObj>,
): Promise<MeasurandMappingRow[]> {
  const cached = mappingCache.get(vendorId);
  if (cached && Date.now() - cached.fetchedAt < MAPPING_CACHE_TTL_MS) return cached.rows;
  try {
    const sequelize = DefaultSequelizeInstance.getInstance(config, logger);
    const rows = await sequelize.query<MeasurandMappingRow>(
      `SELECT "vendorMeasurand", "standardMeasurand", "targetPhase", "valueMultiplier", "targetUnit"
       FROM vendor_measurand_mappings WHERE "vendorId" = :vendorId AND "isActive" = true`,
      { replacements: { vendorId }, type: QueryTypes.SELECT },
    );
    mappingCache.set(vendorId, { rows, fetchedAt: Date.now() });
    return rows;
  } catch (error) {
    logger.error('vendorRegistry: failed to load measurand mappings, using stale/empty cache', error);
    return cached?.rows ?? [];
  }
}

export async function insertVendorDiagnostic(
  params: {
    ocppConnectionName: string;
    vendorId: string;
    source: 'meter' | 'datatransfer';
    type: string;
    transactionId?: string | number | null;
    payload: unknown;
    recordedAt: Date;
  },
  config: BootstrapConfig,
  logger: Logger<ILogObj>,
): Promise<void> {
  try {
    const sequelize = DefaultSequelizeInstance.getInstance(config, logger);
    await sequelize.query(
      `INSERT INTO vendor_diagnostics
        ("ocppConnectionName", "vendorId", source, type, "transactionId", payload, "recordedAt")
       VALUES (:ocppConnectionName, :vendorId, :source, :type, :transactionId, :payload, :recordedAt)`,
      {
        replacements: {
          ocppConnectionName: params.ocppConnectionName,
          vendorId: params.vendorId,
          source: params.source,
          type: params.type,
          transactionId: params.transactionId != null ? String(params.transactionId) : null,
          payload: JSON.stringify(params.payload),
          recordedAt: params.recordedAt.toISOString(),
        },
        type: QueryTypes.INSERT,
      },
    );
  } catch (error) {
    // Never let a diagnostics-capture failure affect the OCPP message flow it's riding along.
    logger.error('vendorRegistry: failed to insert vendor diagnostic', error);
  }
}
