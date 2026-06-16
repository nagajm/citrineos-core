// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { QueryInterface, DataTypes, literal } from 'sequelize';

/**
 * Reconcile the live DB schema with the ChargingStation / Location Sequelize models.
 *
 * Our database was restored from a snapshot whose schema predates several migrations
 * that SequelizeMeta nonetheless records as applied (e.g.
 * 20260202-add-use16-status-notification-0, 20260330-add-charging-station-pk-id,
 * 20260427-rename-charging-station-columns). As a result `db:migrate` is a no-op, yet the
 * columns below — which the models reference and the operator UI queries select — are
 * missing, producing "column ... does not exist" errors on the operator dashboard.
 *
 * This migration is intentionally IDEMPOTENT: it inspects describeTable() and only adds a
 * column when it is absent, so it is safe to run against any partial state and against
 * environments where these columns already exist.
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
  // --- Locations: model timestamps (timestamps: true) ---
  await addIfMissing(queryInterface, 'Locations', 'createdAt', {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: literal('CURRENT_TIMESTAMP'),
  });
  await addIfMissing(queryInterface, 'Locations', 'updatedAt', {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: literal('CURRENT_TIMESTAMP'),
  });

  // --- ChargingStations: model timestamps + location/capability columns ---
  await addIfMissing(queryInterface, 'ChargingStations', 'createdAt', {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: literal('CURRENT_TIMESTAMP'),
  });
  await addIfMissing(queryInterface, 'ChargingStations', 'updatedAt', {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: literal('CURRENT_TIMESTAMP'),
  });
  await addIfMissing(queryInterface, 'ChargingStations', 'coordinates', {
    type: DataTypes.GEOMETRY('POINT'),
    allowNull: true,
  });
  await addIfMissing(queryInterface, 'ChargingStations', 'floorLevel', {
    type: DataTypes.STRING,
    allowNull: true,
  });
  await addIfMissing(queryInterface, 'ChargingStations', 'parkingRestrictions', {
    type: DataTypes.JSONB,
    allowNull: true,
  });
  await addIfMissing(queryInterface, 'ChargingStations', 'capabilities', {
    type: DataTypes.JSONB,
    allowNull: true,
  });
  await addIfMissing(queryInterface, 'ChargingStations', 'use16StatusNotification0', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await removeIfPresent(queryInterface, 'ChargingStations', 'use16StatusNotification0');
  await removeIfPresent(queryInterface, 'ChargingStations', 'capabilities');
  await removeIfPresent(queryInterface, 'ChargingStations', 'parkingRestrictions');
  await removeIfPresent(queryInterface, 'ChargingStations', 'floorLevel');
  await removeIfPresent(queryInterface, 'ChargingStations', 'coordinates');
  await removeIfPresent(queryInterface, 'ChargingStations', 'updatedAt');
  await removeIfPresent(queryInterface, 'ChargingStations', 'createdAt');
  await removeIfPresent(queryInterface, 'Locations', 'updatedAt');
  await removeIfPresent(queryInterface, 'Locations', 'createdAt');
}