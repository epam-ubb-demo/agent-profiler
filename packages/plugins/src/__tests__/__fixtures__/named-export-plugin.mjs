// Valid plugin with named `manifest` export
export const manifest = {
  apiVersion: '1.0',
  plugins: [
    {
      metadata: {
        id: 'named-plugin',
        name: 'Named Export Plugin',
        version: '1.0.0',
      },
      adapterType: 'named',
      createDataSource: (config) => ({
        listSessions: async () => [],
        getSession: async () => null,
        isAvailable: async () => true,
      }),
    },
  ],
};
