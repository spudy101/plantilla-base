// config.ts
import { Sequelize } from 'sequelize';
import constantsModule from '../shared/constants';
const { server } = constantsModule;
import dbConfigs from './database';

const env = server.nodeEnv;
// Perfil del entorno actual (development | test | production)
const config = (dbConfigs as Partial<Record<string, (typeof dbConfigs)[keyof typeof dbConfigs]>>)[env];
if (!config) {
  throw new Error(`config/database: no hay perfil para NODE_ENV=${env}`);
}

// Constructor por opciones: toma database/username/password del propio perfil (el de test no los tiene)
const sequelize = new Sequelize(config);

export default sequelize;
