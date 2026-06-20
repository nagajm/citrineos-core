// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
'use strict';

/** @type {import('sequelize-cli').Migration} */
import { QueryInterface } from 'sequelize';

// Connectors were uniquely keyed by (stationId, connectorId). In OCPP 2.0.1 a connector is
// identified by (evseId, connectorId) together: a multi-EVSE station whose EVSEs each call their
// connector "1" collapsed into a single Connectors row, so only one EVSE ever got a connector and
// its status flipped between EVSEs. Re-key the uniqueness on (stationId, evseId, connectorId) so
// each EVSE keeps its own connector. The StatusNotification handler now sets connector.evseId.
export default {
  up: async (queryInterface: QueryInterface) => {
    console.log('Replacing Connectors unique index (stationId, connectorId) -> (stationId, evseId, connectorId)...');
    // Drop the legacy unique index (created by the model's `unique: 'stationId_connectorId'`).
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "stationId_connectorId"`);
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "stationId_evseId_connectorId"
        ON "Connectors" ("stationId", "evseId", "connectorId")
    `);
    console.log('Successfully updated Connectors unique index.');
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "stationId_evseId_connectorId"`);
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "stationId_connectorId"
        ON "Connectors" ("stationId", "connectorId")
    `);
  },
};