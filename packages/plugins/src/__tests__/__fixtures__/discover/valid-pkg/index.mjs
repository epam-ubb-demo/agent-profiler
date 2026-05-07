// Valid discoverable plugin
export default {
  apiVersion: '1.0',
  plugins: [
    {
      metadata: {
        id: 'discovered-plugin',
        name: 'Discovered Plugin',
        version: '1.0.0',
      },
      adapterType: 'discovered',
      createDataSource: (config) => ({
        listSessions: async () => [],
        getSession: async () => null,
        isAvailable: async () => true,
      }),
    },
  ],
};
