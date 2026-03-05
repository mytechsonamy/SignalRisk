import neo4j from 'neo4j-driver';
import { ConfigService } from '@nestjs/config';

export const NEO4J_DRIVER = 'NEO4J_DRIVER';

export const Neo4jDriverProvider = {
  provide: NEO4J_DRIVER,
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    const neo4jConfig = configService.get('neo4j');
    const uri = neo4jConfig?.uri || 'bolt://localhost:7687';
    const username = neo4jConfig?.username || 'neo4j';
    const password = neo4jConfig?.password || 'password';

    return neo4j.driver(uri, neo4j.auth.basic(username, password));
  },
};
