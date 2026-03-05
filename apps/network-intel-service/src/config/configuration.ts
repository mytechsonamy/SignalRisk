export default () => ({
  port: parseInt(process.env.PORT ?? '3006', 10),
  geoDbPath: process.env.GEO_DB_PATH ?? 'data/GeoLite2-City.mmdb',
  torExitNodesPath: process.env.TOR_EXIT_NODES_PATH ?? 'data/tor-exit-nodes.txt',
});
