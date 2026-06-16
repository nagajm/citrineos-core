// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { QueryInterface, DataTypes } from 'sequelize';

/**
 * Third and final reconcile migration. A full model-vs-table audit (all 69 core models against
 * the live schema) found these were the ONLY remaining columns the current core models select
 * but our restored-from-old-snapshot DB lacked. Missing any of them crashes the OCPP server on
 * the relevant query (e.g. ChargingStation.chargeBoxSerialNumber crashed BootNotification lookups).
 *
 * Audit result (2026-06-16): ChargingStations {chargeBoxSerialNumber, iccid, imsi, meterType,
 * meterSerialNumber}; Transactions {connectorId, authorizationId, tariffId, transactionLimit,
 * customData}; Locations {tenantId}; AsyncJobStatuses {tenantId}.
 *
 * connectorId/authorizationId are added as plain nullable INTEGER (no FK constraint) — just enough
 * for the model SELECT; the Hasura Connector/Authorization relationships remain dropped (FLAG-05).
 * IDEMPOTENT via describeTable guard.
 */

async function addIfMissing(
  queryInterface: QueryInterface,
  table: string,
  column: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  spec: any,
): Promise<void> {
  const desc = await queryInterface.describeTable(table);
  if (!desc[column]) {
    await queryInterface.addColumn(table, column, spec);
  }
}

async function removeIfPresent(
  queryInterface: QueryInterface,
  table: string,
  column: string,
): Promise<void> {
  const desc = await queryInterface.describeTable(table);
  if (desc[column]) {
    await queryInterface.removeColumn(table, column);
  }
}

export async function up(queryInterface: QueryInterface): Promise<void> {
  // ChargingStations: OCPP 1.6 identity / meter fields
  await addIfMissing(queryInterface, 'ChargingStations', 'chargeBoxSerialNumber', {
    type: DataTypes.STRING(25),
    allowNull: true,
  });
  await addIfMissing(queryInterface, 'ChargingStations', 'iccid', {
    type: DataTypes.STRING(20),
    allowNull: true,
  });
  await addIfMissing(queryInterface, 'ChargingStations', 'imsi', {
    type: DataTypes.STRING(20),
    allowNull: true,
  });
  await addIfMissing(queryInterface, 'ChargingStations', 'meterType', {
    type: DataTypes.STRING(25),
    allowNull: true,
  });
  await addIfMissing(queryInterface, 'ChargingStations', 'meterSerialNumber', {
    type: DataTypes.STRING(25),
    allowNull: true,
  });

  // Transactions: FK columns (plain nullable INTEGER, no constraint) + JSONB extras
  await addIfMissing(queryInterface, 'Transactions', 'connectorId', {
    type: DataTypes.INTEGER,
    allowNull: true,
  });
  await addIfMissing(queryInterface, 'Transactions', 'authorizationId', {
    type: DataTypes.INTEGER,
    allowNull: true,
  });
  await addIfMissing(queryInterface, 'Transactions', 'tariffId', {
    type: DataTypes.INTEGER,
    allowNull: true,
  });
  await addIfMissing(queryInterface, 'Transactions', 'transactionLimit', {
    type: DataTypes.JSONB,
    allowNull: true,
  });
  await addIfMissing(queryInterface, 'Transactions', 'customData', {
    type: DataTypes.JSONB,
    allowNull: true,
  });

  // Tenant scoping columns (NOT NULL with default tenant 1)
  await addIfMissing(queryInterface, 'Locations', 'tenantId', {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  });
  await addIfMissing(queryInterface, 'AsyncJobStatuses', 'tenantId', {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await removeIfPresent(queryInterface, 'AsyncJobStatuses', 'tenantId');
  await removeIfPresent(queryInterface, 'Locations', 'tenantId');
  await removeIfPresent(queryInterface, 'Transactions', 'customData');
  await removeIfPresent(queryInterface, 'Transactions', 'transactionLimit');
  await removeIfPresent(queryInterface, 'Transactions', 'tariffId');
  await removeIfPresent(queryInterface, 'Transactions', 'authorizationId');
  await removeIfPresent(queryInterface, 'Transactions', 'connectorId');
  await removeIfPresent(queryInterface, 'ChargingStations', 'meterSerialNumber');
  await removeIfPresent(queryInterface, 'ChargingStations', 'meterType');
  await removeIfPresent(queryInterface, 'ChargingStations', 'imsi');
  await removeIfPresent(queryInterface, 'ChargingStations', 'iccid');
  await removeIfPresent(queryInterface, 'ChargingStations', 'chargeBoxSerialNumber');
}