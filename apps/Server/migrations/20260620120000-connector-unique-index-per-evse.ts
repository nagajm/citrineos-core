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
    console.log('Replacing Connectors unique constraint (stationId, connectorId) -> (stationId, evseId, connectorId)...');
    // The Sequelize model uses `unique: 'stationId_connectorId'` which creates a named TABLE
    // CONSTRAINT (not a plain index), so DROP INDEX fails — must use DROP CONSTRAINT.
    await queryInterface.sequelize.query(
      `ALTER TABLE "Connectors" DROP CONSTRAINT IF EXISTS "stationId_connectorId"`,
    );
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "stationId_evseId_connectorId"
        ON "Connectors" ("stationId", "evseId", "connectorId")
    `);
    console.log('Successfully updated Connectors unique constraint.');
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "stationId_evseId_connectorId"`);
    // Restore as a constraint (not just an index) to match the Sequelize model declaration.
    await queryInterface.sequelize.query(
      `ALTER TABLE "Connectors" ADD CONSTRAINT "stationId_connectorId" UNIQUE ("stationId", "connectorId")`,
    );
  },
};