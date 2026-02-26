import { StorageEnum } from '../base/enums';
import { createStorage } from '../base/base';
import type { BaseStorage } from '../base/types';
import type { Rule, RulesStorageData, RulesStorageOperations } from './types';

export type { Rule, RuleSource, RulesStorageData, RulesStorageOperations } from './types';

const initialState: RulesStorageData = {
  nextId: 1,
  rules: [],
  serverUrl: '',
};

const rulesStorage: BaseStorage<RulesStorageData> = createStorage('rules', initialState, {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
});

export function createRulesStorage(): RulesStorageOperations {
  return {
    addRule: async (name, content, opts = {}): Promise<Rule> => {
      const now = Date.now();
      let newRule: Rule | undefined;

      await rulesStorage.set(prev => {
        const id = prev.nextId;
        newRule = {
          id,
          name,
          content,
          source: opts.source ?? 'local',
          serverId: opts.serverId,
          author: opts.author,
          description: opts.description,
          createdAt: now,
          updatedAt: now,
        };
        return {
          ...prev,
          nextId: id + 1,
          rules: [newRule, ...prev.rules],
        };
      });

      return newRule!;
    },

    updateRule: async (id, updates): Promise<Rule | undefined> => {
      let updated: Rule | undefined;

      await rulesStorage.set(prev => {
        const rules = prev.rules.map(rule => {
          if (rule.id === id) {
            updated = { ...rule, ...updates, updatedAt: Date.now() };
            return updated;
          }
          return rule;
        });

        if (!updated) return prev;
        return { ...prev, rules };
      });

      return updated;
    },

    removeRule: async (id): Promise<void> => {
      await rulesStorage.set(prev => ({
        ...prev,
        rules: prev.rules.filter(rule => rule.id !== id),
      }));
    },

    getAllRules: async (): Promise<Rule[]> => {
      const { rules } = await rulesStorage.get();
      return [...rules].sort((a, b) => b.updatedAt - a.updatedAt);
    },

    getRuleById: async (id): Promise<Rule | undefined> => {
      const { rules } = await rulesStorage.get();
      return rules.find(rule => rule.id === id);
    },

    getServerUrl: async (): Promise<string> => {
      const { serverUrl } = await rulesStorage.get();
      return serverUrl;
    },

    setServerUrl: async (url: string): Promise<void> => {
      await rulesStorage.set(prev => ({ ...prev, serverUrl: url }));
    },
  };
}

export default createRulesStorage();
