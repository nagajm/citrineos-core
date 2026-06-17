// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { QueryInterface, DataTypes, literal } from 'sequelize';

/**
 * Consolidating reconcile migration. The DB was restored from a snapshot whose SequelizeMeta
 * already records the three earlier reconcile migrations (20260616120000 / 20260616140000 /
 * 20260616160000) as applied, but the actual columns are missing because those migrations
 * never ran on the current DB volume. Sequelize trusts SequelizeMeta and skips all three
 * migrations on every container start — this migration breaks that cycle permanently.
 *
 * Because this migration carries a NEW timestamp (20260617000000) it is absent from every
 * snapshot taken before this fix. db:migrate will always run it regardless of which snapshot
 * the DB volume came from. All column additions are guarded by describeTable() so running
 * this against a DB that already has the columns is a safe no-op.
 *
 * Covers every column from all three prior reconcile migrations in one place.
 */

async function addIfMissing(
  queryInterface: QueryInterface,
  table: string,
  column: string,
  spec: any,
): Promise<void> {
  const desc = await queryInterface.describeTable(table);
  if (!desc[column]) {
    await queryInterface.addColumn(table, column, spec);
  }
}

export async function up(queryInterface: QueryInterface): Promise<void> {
  // -- Locations ---------------------------------------------------------------
  await addIfMissing(queryInterface, 'Locations', 'createdAt', { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') });
  await addIfMissing(queryInterface, 'Locations', 'updatedAt', { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') });
  await addIfMissing(queryInterface, 'Locations', 'publishUpstream', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true });
  await addIfMissing(queryInterface, 'Locations', 'parkingType', { type: DataTypes.STRING, allowNull: true });
  await addIfMissing(queryInterface, 'Locations', 'facilities', { type: DataTypes.JSONB, allowNull: true });
  await addIfMissing(queryInterface, 'Locations', 'openingHours', { type: DataTypes.JSONB, allowNull: true });
  await addIfMissing(queryInterface, 'Locations', 'tenantId', { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 });

  // -- ChargingStations --------------------------------------------------------
  await addIfMissing(queryInterface, 'ChargingStations', 'createdAt', { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') });
  await addIfMissing(queryInterface, 'ChargingStations', 'updatedAt', { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') });
  await addIfMissing(queryInterface, 'ChargingStations', 'coordinates', { type: DataTypes.GEOMETRY('POINT'), allowNull: true });
  await addIfMissing(queryInterface, 'ChargingStations', 'floorLevel', { type: DataTypes.STRING, allowNull: true });
  await addIfMissing(queryInterface, 'ChargingStations', 'parkingRestrictions', { type: DataTypes.JSONB, allowNull: true });
  await addIfMissing(queryInterface, 'ChargingStations', 'capabilities', { type: DataTypes.JSONB, allowNull: true });
  await addIfMissing(queryInterface, 'ChargingStations', 'use16StatusNotification0', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true });
  await addIfMissing(queryInterface, 'ChargingStations', 'chargeBoxSerialNumber', { type: DataTypes.STRING(25), allowNull: true });
  await addIfMissing(queryInterface, 'ChargingStations', 'iccid', { type: DataTypes.STRING(20), allowNull: true });
  await addIfMissing(queryInterface, 'ChargingStations', 'imsi', { type: DataTypes.STRING(20), allowNull: true });
  await addIfMissing(queryInterface, 'ChargingStations', 'meterType', { type: DataTypes.STRING(25), allowNull: true });
  await addIfMissing(queryInterface, 'ChargingStations', 'meterSerialNumber', { type: DataTypes.STRING(25), allowNull: true });

  // -- Transactions ------------------------------------------------------------
  await addIfMissing(queryInterface, 'Transactions', 'timeSpentCharging', { type: DataTypes.BIGINT, allowNull: true });
  await addIfMissing(queryInterface, 'Transactions', 'remoteStartId', { type: DataTypes.INTEGER, allowNull: true });
  await addIfMissing(queryInterface, 'Transactions', 'createdAt', { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') });
  await addIfMissing(queryInterface, 'Transactions', 'updatedAt', { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') });
  await addIfMissing(queryInterface, 'Transactions', 'connectorId', { type: DataTypes.INTEGER, allowNull: true });
  await addIfMissing(queryInterface, 'Transactions', 'authorizationId', { type: DataTypes.INTEGER, allowNull: true });
  await addIfMissing(queryInterface, 'Transactions', 'tariffId', { type: DataTypes.INTEGER, allowNull: true });
  await addIfMissing(queryInterface, 'Transactions', 'transactionLimit', { type: DataTypes.JSONB, allowNull: true });
  await addIfMissing(queryInterface, 'Transactions', 'customData', { type: DataTypes.JSONB, allowNull: true });

  // -- AsyncJobStatuses --------------------------------------------------------
  await addIfMissing(queryInterface, 'AsyncJobStatuses', 'tenantId', { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 });
}

// These columns are load-bearing for the OCPP server - rolling back would break production.
export async function down(_queryInterface: QueryInterface): Promise<void> {
  // intentional no-op
}