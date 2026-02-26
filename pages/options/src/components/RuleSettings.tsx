import { useState, useEffect, useCallback, useRef } from 'react';
import { rulesStorage } from '@extension/storage';
import type { Rule } from '@extension/storage';
import { Button } from '@extension/ui';
import { t } from '@extension/i18n';

interface RuleSettingsProps {
  isDarkMode: boolean;
}

interface ServerRuleItem {
  id: string;
  name: string;
  content: string;
  author: string;
  description: string;
  created_at: string;
  updated_at: string;
}

function isValidHttpUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export const RuleSettings = ({ isDarkMode }: RuleSettingsProps) => {
  const [localRules, setLocalRules] = useState<Rule[]>([]);
  const [serverRules, setServerRules] = useState<ServerRuleItem[]>([]);
  const [serverUrl, setServerUrl] = useState('');
  const [serverUrlInput, setServerUrlInput] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Editor state
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formContent, setFormContent] = useState('');

  // Clean up status timer on unmount
  useEffect(() => {
    return () => {
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    };
  }, []);

  const showStatus = useCallback((msg: string) => {
    setStatusMessage(msg);
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => setStatusMessage(''), 3000);
  }, []);

  const loadLocalRules = useCallback(async () => {
    const rules = await rulesStorage.getAllRules();
    setLocalRules(rules);
  }, []);

  const loadServerUrl = useCallback(async () => {
    const url = await rulesStorage.getServerUrl();
    setServerUrl(url);
    setServerUrlInput(url);
  }, []);

  const loadServerRules = useCallback(async () => {
    if (!serverUrl || !isValidHttpUrl(serverUrl)) return;
    try {
      const resp = await fetch(`${serverUrl}/api/rules`);
      if (!resp.ok) throw new Error('Server error');
      const data = await resp.json();
      setServerRules(data.rules ?? []);
    } catch {
      setServerRules([]);
      showStatus(t('options_rules_serverError'));
    }
  }, [serverUrl, showStatus]);

  useEffect(() => {
    loadLocalRules();
    loadServerUrl();
  }, [loadLocalRules, loadServerUrl]);

  useEffect(() => {
    loadServerRules();
  }, [loadServerRules]);

  // ---- Server URL ----
  const handleSaveServerUrl = async () => {
    const cleanUrl = serverUrlInput.trim().replace(/\/+$/, '');
    if (cleanUrl && !isValidHttpUrl(cleanUrl)) {
      showStatus(t('options_rules_errors_invalidUrl'));
      return;
    }
    await rulesStorage.setServerUrl(cleanUrl);
    setServerUrl(cleanUrl);
  };

  // ---- CRUD ----
  const handleCreate = async () => {
    if (!formName.trim() || !formContent.trim()) return;
    await rulesStorage.addRule(formName.trim(), formContent.trim(), {
      description: formDescription.trim(),
    });
    resetForm();
    await loadLocalRules();
  };

  const handleUpdate = async () => {
    if (!editingRule || !formName.trim() || !formContent.trim()) return;
    await rulesStorage.updateRule(editingRule.id, {
      name: formName.trim(),
      content: formContent.trim(),
      description: formDescription.trim(),
    });
    resetForm();
    await loadLocalRules();
  };

  const handleDelete = async (id: number) => {
    await rulesStorage.removeRule(id);
    await loadLocalRules();
  };

  const startEdit = (rule: Rule) => {
    setEditingRule(rule);
    setIsCreating(false);
    setFormName(rule.name);
    setFormDescription(rule.description ?? '');
    setFormContent(rule.content);
  };

  const startCreate = () => {
    setEditingRule(null);
    setIsCreating(true);
    setFormName('');
    setFormDescription('');
    setFormContent('');
  };

  const resetForm = () => {
    setEditingRule(null);
    setIsCreating(false);
    setFormName('');
    setFormDescription('');
    setFormContent('');
  };

  // ---- Push / Pull ----
  const handlePush = async (rule: Rule) => {
    if (!serverUrl || !isValidHttpUrl(serverUrl)) return;
    try {
      const resp = await fetch(`${serverUrl}/api/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: rule.name,
          content: rule.content,
          author: rule.author ?? '',
          description: rule.description ?? '',
        }),
      });
      if (!resp.ok) throw new Error('Push failed');
      await resp.json();
      showStatus(t('options_rules_pushSuccess'));
      await loadServerRules();
      await loadLocalRules();
    } catch {
      showStatus(t('options_rules_serverError'));
    }
  };

  const handlePullSingle = async (serverRule: ServerRuleItem) => {
    // Read fresh local rules from storage to avoid stale closure issues
    const currentRules = await rulesStorage.getAllRules();
    const existing = currentRules.find(r => r.serverId === serverRule.id);
    if (existing) {
      await rulesStorage.updateRule(existing.id, {
        name: serverRule.name,
        content: serverRule.content,
        description: serverRule.description,
      });
    } else {
      await rulesStorage.addRule(serverRule.name, serverRule.content, {
        source: 'server',
        serverId: serverRule.id,
        author: serverRule.author,
        description: serverRule.description,
      });
    }
  };

  const handlePullAll = async () => {
    if (!serverUrl || !isValidHttpUrl(serverUrl)) return;
    try {
      const resp = await fetch(`${serverUrl}/api/rules`);
      if (!resp.ok) throw new Error('Fetch failed');
      const data = await resp.json();
      const rules: ServerRuleItem[] = data.rules ?? [];
      for (const sr of rules) {
        await handlePullSingle(sr);
      }
      showStatus(t('options_rules_pullSuccess'));
      await loadLocalRules();
    } catch {
      showStatus(t('options_rules_serverError'));
    }
  };

  const cardClass = `rounded-lg border ${isDarkMode ? 'border-slate-700 bg-slate-800' : 'border-blue-100 bg-gray-50'} p-6 text-left shadow-sm`;
  const inputClass = `w-full rounded-md border px-3 py-2 text-sm ${isDarkMode ? 'border-gray-600 bg-slate-700 text-white' : 'border-gray-300 bg-white text-gray-700'}`;
  const headingClass = `mb-4 text-xl font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`;
  const subHeadingClass = `mb-3 text-lg font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`;
  const textClass = isDarkMode ? 'text-gray-300' : 'text-gray-600';
  const mutedTextClass = isDarkMode ? 'text-gray-400' : 'text-gray-500';

  return (
    <section className="space-y-6">
      {/* Status message */}
      {statusMessage && (
        <div
          className={`rounded-md p-3 text-sm ${isDarkMode ? 'bg-sky-900/50 text-sky-200' : 'bg-sky-50 text-sky-700'}`}>
          {statusMessage}
        </div>
      )}

      {/* Server URL config */}
      <div className={cardClass}>
        <h2 className={headingClass}>{t('options_rules_header')}</h2>
        <p className={`mb-4 text-sm ${mutedTextClass}`}>{t('options_rules_description')}</p>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className={`mb-1 block text-sm font-medium ${textClass}`}>
              {t('options_rules_serverUrl_label')}
            </label>
            <input
              type="text"
              value={serverUrlInput}
              onChange={e => setServerUrlInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveServerUrl()}
              placeholder={t('options_rules_serverUrl_placeholder')}
              className={inputClass}
            />
          </div>
          <Button
            onClick={handleSaveServerUrl}
            className={`px-4 py-2 text-sm ${isDarkMode ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-blue-500 text-white hover:bg-blue-600'}`}>
            {t('options_rules_btnSaveServer')}
          </Button>
        </div>
      </div>

      {/* Rule editor form */}
      {(isCreating || editingRule) && (
        <div className={cardClass}>
          <h3 className={subHeadingClass}>
            {editingRule ? t('options_rules_btnEdit') : t('options_rules_btnAddRule')}
          </h3>
          <div className="space-y-3">
            <input
              type="text"
              value={formName}
              onChange={e => setFormName(e.target.value)}
              placeholder={t('options_rules_namePlaceholder')}
              className={inputClass}
            />
            <input
              type="text"
              value={formDescription}
              onChange={e => setFormDescription(e.target.value)}
              placeholder={t('options_rules_descriptionPlaceholder')}
              className={inputClass}
            />
            <textarea
              value={formContent}
              onChange={e => setFormContent(e.target.value)}
              placeholder={t('options_rules_contentPlaceholder')}
              rows={8}
              className={`${inputClass} resize-y font-mono`}
            />
            <div className="flex gap-2">
              <Button
                onClick={editingRule ? handleUpdate : handleCreate}
                className={`px-4 py-2 text-sm ${isDarkMode ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-green-500 text-white hover:bg-green-600'}`}>
                {t('options_rules_btnSave')}
              </Button>
              <Button
                onClick={resetForm}
                className={`px-4 py-2 text-sm ${isDarkMode ? 'bg-slate-600 text-white hover:bg-slate-500' : 'bg-gray-300 text-gray-700 hover:bg-gray-400'}`}>
                {t('options_rules_btnCancel')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Local rules */}
      <div className={cardClass}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className={`text-xl font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
            {t('options_rules_localRules_header')}
          </h2>
          <Button
            onClick={startCreate}
            className={`px-4 py-2 text-sm ${isDarkMode ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-blue-500 text-white hover:bg-blue-600'}`}>
            {t('options_rules_btnAddRule')}
          </Button>
        </div>

        {localRules.length === 0 ? (
          <p className={`text-center text-sm ${mutedTextClass}`}>{t('options_rules_emptyLocal')}</p>
        ) : (
          <ul className="space-y-2">
            {localRules.map(rule => (
              <li key={rule.id} className={`rounded-md p-3 ${isDarkMode ? 'bg-slate-700' : 'bg-gray-100'}`}>
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                        {rule.name}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs ${
                          rule.source === 'server'
                            ? isDarkMode
                              ? 'bg-purple-800 text-purple-200'
                              : 'bg-purple-100 text-purple-700'
                            : isDarkMode
                              ? 'bg-emerald-800 text-emerald-200'
                              : 'bg-emerald-100 text-emerald-700'
                        }`}>
                        {rule.source}
                      </span>
                    </div>
                    {rule.description && <p className={`mt-1 text-xs ${mutedTextClass}`}>{rule.description}</p>}
                    <pre className={`mt-2 max-h-24 overflow-auto whitespace-pre-wrap text-xs ${mutedTextClass}`}>
                      {rule.content.slice(0, 300)}
                      {rule.content.length > 300 ? '…' : ''}
                    </pre>
                  </div>
                  <div className="ml-2 flex shrink-0 gap-1">
                    <Button
                      onClick={() => startEdit(rule)}
                      className={`px-2 py-1 text-xs ${isDarkMode ? 'bg-slate-600 text-white hover:bg-slate-500' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>
                      {t('options_rules_btnEdit')}
                    </Button>
                    <Button
                      onClick={() => handleDelete(rule.id)}
                      className={`px-2 py-1 text-xs ${isDarkMode ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-red-500 text-white hover:bg-red-600'}`}>
                      {t('options_rules_btnDelete')}
                    </Button>
                    {serverUrl && (
                      <Button
                        onClick={() => handlePush(rule)}
                        className={`px-2 py-1 text-xs ${isDarkMode ? 'bg-purple-600 text-white hover:bg-purple-700' : 'bg-purple-500 text-white hover:bg-purple-600'}`}>
                        {t('options_rules_btnPush')}
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Server rules */}
      {serverUrl && (
        <div className={cardClass}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className={`text-xl font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
              {t('options_rules_serverRules_header')}
            </h2>
            <Button
              onClick={handlePullAll}
              className={`px-4 py-2 text-sm ${isDarkMode ? 'bg-purple-600 text-white hover:bg-purple-700' : 'bg-purple-500 text-white hover:bg-purple-600'}`}>
              {t('options_rules_btnPullAll')}
            </Button>
          </div>

          {serverRules.length === 0 ? (
            <p className={`text-center text-sm ${mutedTextClass}`}>{t('options_rules_emptyServer')}</p>
          ) : (
            <ul className="space-y-2">
              {serverRules.map(rule => (
                <li key={rule.id} className={`rounded-md p-3 ${isDarkMode ? 'bg-slate-700' : 'bg-gray-100'}`}>
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <span className={`font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                        {rule.name}
                      </span>
                      {rule.author && <span className={`ml-2 text-xs ${mutedTextClass}`}>by {rule.author}</span>}
                      {rule.description && <p className={`mt-1 text-xs ${mutedTextClass}`}>{rule.description}</p>}
                      <pre className={`mt-2 max-h-24 overflow-auto whitespace-pre-wrap text-xs ${mutedTextClass}`}>
                        {rule.content.slice(0, 300)}
                        {rule.content.length > 300 ? '…' : ''}
                      </pre>
                    </div>
                    <div className="ml-2 shrink-0">
                      <Button
                        onClick={async () => {
                          await handlePullSingle(rule);
                          showStatus(t('options_rules_pullSuccess'));
                          await loadLocalRules();
                        }}
                        className={`px-2 py-1 text-xs ${isDarkMode ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-blue-500 text-white hover:bg-blue-600'}`}>
                        {t('options_rules_btnPull')}
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
};
