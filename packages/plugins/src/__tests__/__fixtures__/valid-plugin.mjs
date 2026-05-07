// Valid plugin with default export
export default {
  apiVersion: '1.0',
  plugins: [
    {
      metadata: {
        id: 'fixture-plugin',
        name: 'Fixture Plugin',
        version: '1.0.0',
      },
      adapterType: 'fixture',
      createDataSource: (config) => ({
        listSessions: async () => [],
        getSession: async () => null,
        isAvailable: async () => true,
      }),
    },
  ],
};
