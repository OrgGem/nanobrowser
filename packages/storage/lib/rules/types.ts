// Rule source indicates where the rule originated
export type RuleSource = 'local' | 'server';

// A single rule (markdown-based skill file)
export interface Rule {
  id: number;
  name: string;
  content: string;
  source: RuleSource;
  serverId?: string; // ID on the remote server (if synced)
  author?: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

// Internal storage shape
export interface RulesStorageData {
  nextId: number;
  rules: Rule[];
  serverUrl: string;
}

// Public CRUD operations
export interface RulesStorageOperations {
  addRule: (
    name: string,
    content: string,
    opts?: Partial<Pick<Rule, 'source' | 'serverId' | 'author' | 'description'>>,
  ) => Promise<Rule>;
  updateRule: (
    id: number,
    updates: Partial<Pick<Rule, 'name' | 'content' | 'description'>>,
  ) => Promise<Rule | undefined>;
  removeRule: (id: number) => Promise<void>;
  getAllRules: () => Promise<Rule[]>;
  getRuleById: (id: number) => Promise<Rule | undefined>;
  getServerUrl: () => Promise<string>;
  setServerUrl: (url: string) => Promise<void>;
}
