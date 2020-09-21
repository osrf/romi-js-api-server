declare namespace NodeJS {
  interface ProcessEnv {
    // semi colon delimited list of plugins to load
    readonly ROMI_DASHBOARD_SERVER_RPC_PLUGINS?: string;
  }
}
