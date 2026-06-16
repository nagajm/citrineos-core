// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { QueryInterface, DataTypes, literal } from 'sequelize';

/**
 * Second reconcile migration (see 20260616120000): bring Locations and Transactions in line
 * with their current Sequelize models. Our DB was restored from an old snapshot, so these
 * model-defined columns are absent even though SequelizeMeta records the relevant migrations
 * as applied. Adding them lets the operator UI run its (upstream) queries without stripping.
 *
 * Scope decision (2026-06-16): scalar columns only. Transactions FK columns
 * (connectorId, authorizationId, tariffId) and transactionLimit are intentionally NOT added
 * here — restoring those + the Hasura Connector/Authorization relationships is a separate,
 * higher-risk change (FLAG-05 in REVIEWER_NOTES).
 *
 * IDEMPOTENT: each column is added only if describeTable() shows it absent.
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
  // --- Locations: OCPI / model columns ---
  await addIfMissing(queryInterface, 'Locations', 'publishUpstream', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  });
  await addIfMissing(queryInterface, 'Locations', 'parkingType', {
    type: DataTypes.STRING,
    allowNull: true,
  });
  await addIfMissing(queryInterface, 'Locations', 'facilities', {
    type: DataTypes.JSONB,
    allowNull: true,
  });
  await addIfMissing(queryInterface, 'Locations', 'openingHours', {
    type: DataTypes.JSONB,
    allowNull: true,
  });

  // --- Transactions: scalar model columns (no FKs) ---
  await addIfMissing(queryInterface, 'Transactions', 'timeSpentCharging', {
    type: DataTypes.BIGINT,
    allowNull: true,
  });
  await addIfMissing(queryInterface, 'Transactions', 'remoteStartId', {
    type: DataTypes.INTEGER,
    allowNull: true,
  });
  await addIfMissing(queryInterface, 'Transactions', 'createdAt', {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: literal('CURRENT_TIMESTAMP'),
  });
  await addIfMissing(queryInterface, 'Transactions', 'updatedAt', {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: literal('CURRENT_TIMESTAMP'),
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await removeIfPresent(queryInterface, 'Transactions', 'updatedAt');
  await removeIfPresent(queryInterface, 'Transactions', 'createdAt');
  await removeIfPresent(queryInterface, 'Transactions', 'remoteStartId');
  await removeIfPresent(queryInterface, 'Transactions', 'timeSpentCharging');
  await removeIfPresent(queryInterface, 'Locations', 'openingHours');
  await removeIfPresent(queryInterface, 'Locations', 'facilities');
  await removeIfPresent(queryInterface, 'Locations', 'parkingType');
  await removeIfPresent(queryInterface, 'Locations', 'publishUpstream');
}