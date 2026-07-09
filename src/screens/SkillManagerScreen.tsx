import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import AppHeader from '../components/AppHeader';
import Dialog from '../components/Dialog';
import { AppSwitch } from '../services/adapters/SwitchAdapter';
import { theme } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { skillManager } from '../services/SkillManager';
import type { Skill } from '../types/skill';

const MAX_SKILL_COUNT = 15;
const COMMUNITY_SKILLS_URL = 'https://github.com/topics/agent-skills';

type FilterTab = 'all' | 'builtin' | 'custom';

type SkillRowProps = {
  skill: Skill;
  themeColors: (typeof theme)['light'];
  inMulti: boolean;
  picked: boolean;
  busy: boolean;
  onToggle: () => void;
  onPick: () => void;
  onLong: () => void;
  onView: () => void;
  onSecret: () => void;
  onDelete: () => void;
  onHome: (url: string) => void;
};

function SkillRow({
  skill,
  themeColors,
  inMulti,
  picked,
  busy,
  onToggle,
  onPick,
  onLong,
  onView,
  onSecret,
  onDelete,
  onHome,
}: SkillRowProps) {
  const isCustom = skill.source !== 'builtin';
  const homepage = skill.metadata?.homepage;
  const needsSecret = !!skill.secret;

  return (
    <Pressable
      onLongPress={isCustom ? onLong : undefined}
      onPress={inMulti && isCustom ? onPick : undefined}
      style={[
        styles.skillRow,
        { backgroundColor: themeColors.cardBackground },
        inMulti && !isCustom ? styles.dimRow : null,
      ]}
    >
      {inMulti && isCustom ? (
        <TouchableOpacity onPress={onPick} style={styles.pickWrap}>
          <MaterialCommunityIcons
            name={picked ? 'checkbox-marked' : 'checkbox-blank-outline'}
            size={22}
            color={themeColors.primary}
          />
        </TouchableOpacity>
      ) : null}

      <View style={styles.skillMain}>
        <View style={styles.skillTop}>
          <View style={styles.skillText}>
            {homepage ? (
              <TouchableOpacity onPress={() => onHome(homepage)}>
                <Text style={[styles.skillName, { color: themeColors.primary }]}>{skill.name}</Text>
              </TouchableOpacity>
            ) : (
              <Text style={[styles.skillName, { color: themeColors.text }]}>{skill.name}</Text>
            )}
            <Text style={[styles.skillDesc, { color: themeColors.secondaryText }]}>
              {skill.description.replace(/\n/g, ' ')}
            </Text>
          </View>
          {!inMulti ? (
            <AppSwitch
              value={skill.enabled}
              onValueChange={onToggle}
              disabled={busy}
            />
          ) : null}
        </View>

        {!inMulti ? (
          <View style={styles.actionRow}>
            <TouchableOpacity onPress={onView}>
              <Text style={[styles.actionText, { color: themeColors.primary }]}>View</Text>
            </TouchableOpacity>
            {needsSecret ? (
              <TouchableOpacity onPress={onSecret}>
                <Text style={[styles.actionText, { color: themeColors.primary }]}>Secret</Text>
              </TouchableOpacity>
            ) : null}
            {isCustom ? (
              <TouchableOpacity onPress={onDelete}>
                <Text style={[styles.actionText, { color: '#C62828' }]}>Delete</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function SkillManagerScreen() {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];

  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [inMulti, setInMulti] = useState(false);
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showLimit, setShowLimit] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [deleteIds, setDeleteIds] = useState<string[]>([]);

  const [viewSkill, setViewSkill] = useState<Skill | null>(null);
  const [secretSkill, setSecretSkill] = useState<Skill | null>(null);
  const [secretVal, setSecretVal] = useState('');

  const listRef = useRef<ScrollView>(null);

  const loadSkills = async () => {
    console.log('skills_load');
    setLoading(true);
    try {
      const next = await skillManager.getAll();
      setSkills(next);
      await skillManager.syncTools();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSkills();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = skills;
    if (filterTab === 'builtin') {
      list = list.filter(skill => skill.source === 'builtin');
    } else if (filterTab === 'custom') {
      list = list.filter(skill => skill.source !== 'builtin');
    }
    if (!q) {
      return list;
    }
    return list.filter(
      skill =>
        skill.name.toLowerCase().includes(q) ||
        skill.description.toLowerCase().includes(q),
    );
  }, [skills, search, filterTab]);

  const enabledCount = useMemo(
    () => skills.filter(skill => skill.enabled).length,
    [skills],
  );

  useEffect(() => {
    if (enabledCount > MAX_SKILL_COUNT) {
      setShowLimit(true);
      const t = setTimeout(() => setShowLimit(false), 3000);
      return () => clearTimeout(t);
    }
  }, [enabledCount]);

  useEffect(() => {
    if (search) {
      listRef.current?.scrollTo({ y: 0, animated: false });
    }
  }, [search, filterTab]);

  useEffect(() => {
    const loadSecret = async () => {
      if (!secretSkill?.secret) {
        setSecretVal('');
        return;
      }
      const val = await skillManager.getSecret(secretSkill.id);
      setSecretVal(val || '');
    };
    loadSecret();
  }, [secretSkill?.id, secretSkill?.secret]);

  const handleToggle = async (skillId: string) => {
    try {
      setBusyId(skillId);
      await skillManager.toggle(skillId);
      await loadSkills();
    } catch (error) {
      Alert.alert('Skill update failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setBusyId(null);
    }
  };

  const handleAll = async (on: boolean) => {
    try {
      setBusyId('all');
      await skillManager.setAllEnabled(on);
      await loadSkills();
    } catch (error) {
      Alert.alert('Update failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setBusyId(null);
    }
  };

  const handleImportUrl = async () => {
    if (!importUrl.trim()) {
      return;
    }
    try {
      setBusyId('import-url');
      await skillManager.importFromUrl(importUrl.trim());
      setImportUrl('');
      setShowUrl(false);
      await loadSkills();
    } catch (error) {
      Alert.alert('Import failed', error instanceof Error ? error.message : 'Could not import skill');
    } finally {
      setBusyId(null);
    }
  };

  const handleImportFile = async () => {
    setShowAdd(false);
    try {
      setBusyId('import-file');
      await skillManager.importFromFile();
      await loadSkills();
    } catch (error) {
      Alert.alert('Import failed', error instanceof Error ? error.message : 'Could not import skill file');
    } finally {
      setBusyId(null);
    }
  };

  const handleImportZip = async () => {
    setShowAdd(false);
    try {
      setBusyId('import-zip');
      await skillManager.importFromZip();
      await loadSkills();
    } catch (error) {
      Alert.alert('Import failed', error instanceof Error ? error.message : 'Could not import skill zip');
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    try {
      setBusyId('delete');
      await skillManager.removeMany(deleteIds);
      setPickedIds([]);
      setInMulti(false);
      setShowDelete(false);
      setDeleteIds([]);
      await loadSkills();
    } catch (error) {
      Alert.alert('Delete failed', error instanceof Error ? error.message : 'Could not delete skill');
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveSecret = async () => {
    if (!secretSkill) {
      return;
    }
    try {
      setBusyId(`secret-${secretSkill.id}`);
      await skillManager.setSecret(secretSkill.id, secretVal);
      setSecretSkill(null);
      Alert.alert('Saved', 'Skill secret updated.');
    } catch (error) {
      Alert.alert('Save failed', error instanceof Error ? error.message : 'Could not save secret');
    } finally {
      setBusyId(null);
    }
  };

  const handleCopyView = () => {
    if (!viewSkill?.instructions) {
      return;
    }
    Clipboard.setString(viewSkill.instructions);
    console.log('skill_view_copied', viewSkill.id);
    Alert.alert('Copied', 'Skill content copied to clipboard.');
  };

  const openDelete = (ids: string[]) => {
    setDeleteIds(ids);
    setShowDelete(true);
  };

  const togglePick = (id: string) => {
    setPickedIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      if (next.length === 0) {
        setInMulti(false);
      }
      return next;
    });
  };

  const startMulti = (id: string) => {
    setInMulti(true);
    setPickedIds([id]);
  };

  const exitMulti = () => {
    setInMulti(false);
    setPickedIds([]);
  };

  const tabs: { id: FilterTab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'builtin', label: 'Built-in' },
    { id: 'custom', label: 'Custom' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: themeColors.background }}>
      <AppHeader title="Skills" showBackButton showLogo={false} rightButtons={[]} />

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={themeColors.primary} />
        </View>
      ) : (
        <View style={styles.body}>
          {inMulti ? (
            <View style={styles.multiBar}>
              <TouchableOpacity onPress={exitMulti}>
                <Text style={[styles.linkText, { color: themeColors.primary }]}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[styles.multiLabel, { color: themeColors.text }]}>
                {`${pickedIds.length} selected`}
              </Text>
              <TouchableOpacity
                onPress={() => pickedIds.length > 0 && openDelete(pickedIds)}
                disabled={pickedIds.length === 0}
              >
                <Text style={[styles.linkText, { color: pickedIds.length > 0 ? '#C62828' : themeColors.secondaryText }]}>
                  Delete
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {showLimit ? (
            <Text style={[styles.noteText, { color: themeColors.secondaryText }]}>
              {`More than ${MAX_SKILL_COUNT} skills enabled may affect performance.`}
            </Text>
          ) : null}

          <View style={styles.tabRow}>
            {tabs.map(tab => (
              <TouchableOpacity key={tab.id} onPress={() => setFilterTab(tab.id)}>
                <Text
                  style={[
                    styles.tabText,
                    {
                      color: filterTab === tab.id ? themeColors.primary : themeColors.secondaryText,
                      fontWeight: filterTab === tab.id ? '700' : '400',
                    },
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search"
            placeholderTextColor={themeColors.secondaryText}
            style={[
              styles.searchInput,
              { color: themeColors.text, backgroundColor: themeColors.cardBackground },
            ]}
            autoCapitalize="none"
          />

          <View style={styles.topRow}>
            <Text style={[styles.countText, { color: themeColors.secondaryText }]}>
              {`${enabledCount} of ${skills.length} on`}
            </Text>
            <View style={styles.topActions}>
              <TouchableOpacity onPress={() => handleAll(true)} disabled={busyId === 'all'}>
                <Text style={[styles.linkText, { color: themeColors.primary }]}>All on</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleAll(false)} disabled={busyId === 'all'}>
                <Text style={[styles.linkText, { color: themeColors.primary }]}>All off</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowAdd(true)}>
                <Text style={[styles.linkText, { color: themeColors.primary }]}>Import</Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            ref={listRef}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {filtered.map(skill => (
              <SkillRow
                key={skill.id}
                skill={skill}
                themeColors={themeColors}
                inMulti={inMulti}
                picked={pickedIds.includes(skill.id)}
                busy={busyId === skill.id}
                onToggle={() => handleToggle(skill.id)}
                onPick={() => {
                  const wasPicked = pickedIds.includes(skill.id);
                  if (wasPicked && pickedIds.length === 1) {
                    exitMulti();
                    return;
                  }
                  togglePick(skill.id);
                }}
                onLong={() => startMulti(skill.id)}
                onView={() => setViewSkill(skill)}
                onSecret={() => setSecretSkill(skill)}
                onDelete={() => openDelete([skill.id])}
                onHome={url => Linking.openURL(url).catch(() => Alert.alert('Open failed', 'Could not open homepage.'))}
              />
            ))}
          </ScrollView>
        </View>
      )}

      <Dialog
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        title="Import skill"
        dismissOnBackdropPress
        secondaryButtonText="Cancel"
        onSecondaryPress={() => setShowAdd(false)}
      >
        <TouchableOpacity
          style={[styles.addRow, { backgroundColor: themeColors.cardBackground }]}
          onPress={() => {
            setShowAdd(false);
            setShowUrl(true);
          }}
        >
          <Text style={[styles.addTitle, { color: themeColors.text }]}>From URL</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.addRow, { backgroundColor: themeColors.cardBackground }]}
          onPress={handleImportZip}
        >
          <Text style={[styles.addTitle, { color: themeColors.text }]}>From zip</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.addRow, { backgroundColor: themeColors.cardBackground }]}
          onPress={handleImportFile}
        >
          <Text style={[styles.addTitle, { color: themeColors.text }]}>From file</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.addRow, { backgroundColor: themeColors.cardBackground }]}
          onPress={() => {
            setShowAdd(false);
            Linking.openURL(COMMUNITY_SKILLS_URL).catch(() => {
              Alert.alert('Open failed', 'Could not open community skills page.');
            });
          }}
        >
          <Text style={[styles.addTitle, { color: themeColors.text }]}>Community list</Text>
        </TouchableOpacity>
      </Dialog>

      <Dialog
        visible={showUrl}
        onClose={() => setShowUrl(false)}
        title="Import from URL"
        description="Skill folder URL"
        dismissOnBackdropPress
        primaryButtonText="Import"
        primaryButtonLoading={busyId === 'import-url'}
        onPrimaryPress={handleImportUrl}
        secondaryButtonText="Cancel"
        onSecondaryPress={() => setShowUrl(false)}
      >
        <TextInput
          value={importUrl}
          onChangeText={setImportUrl}
          placeholder="https://example.com/my-skill"
          placeholderTextColor={themeColors.secondaryText}
          autoCapitalize="none"
          style={[
            styles.dialogInput,
            { color: themeColors.text, backgroundColor: themeColors.cardBackground },
          ]}
        />
      </Dialog>

      <Dialog
        visible={showDelete}
        onClose={() => setShowDelete(false)}
        title={deleteIds.length > 1 ? 'Delete skills' : 'Delete skill'}
        description="This cannot be undone."
        dismissOnBackdropPress
        primaryButtonText="Delete"
        primaryButtonColor="#C62828"
        primaryButtonLoading={busyId === 'delete'}
        onPrimaryPress={confirmDelete}
        secondaryButtonText="Cancel"
        onSecondaryPress={() => setShowDelete(false)}
      />

      <Dialog
        visible={!!secretSkill}
        onClose={() => setSecretSkill(null)}
        title="Secret"
        description={secretSkill?.secret?.label}
        dismissOnBackdropPress
        primaryButtonText="Save"
        primaryButtonLoading={busyId?.startsWith('secret-') ?? false}
        onPrimaryPress={handleSaveSecret}
        secondaryButtonText="Cancel"
        onSecondaryPress={() => setSecretSkill(null)}
      >
        <TextInput
          value={secretVal}
          onChangeText={setSecretVal}
          secureTextEntry
          placeholder="Value"
          placeholderTextColor={themeColors.secondaryText}
          style={[
            styles.dialogInput,
            { color: themeColors.text, backgroundColor: themeColors.cardBackground },
          ]}
        />
      </Dialog>

      <Dialog
        visible={!!viewSkill}
        onClose={() => setViewSkill(null)}
        dismissOnBackdropPress
        maxWidth={480}
      >
        <Dialog.Title>{viewSkill?.name}</Dialog.Title>
        <Dialog.Content>
          <ScrollView style={styles.viewScroll} showsVerticalScrollIndicator={false}>
            <Text style={[styles.viewDesc, { color: themeColors.secondaryText }]}>
              {viewSkill?.description}
            </Text>
            <View style={styles.viewHead}>
              <Text style={[styles.viewLabel, { color: themeColors.text }]}>Instructions</Text>
              <TouchableOpacity onPress={handleCopyView}>
                <Text style={[styles.linkText, { color: themeColors.primary }]}>Copy</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              value={viewSkill?.instructions ?? ''}
              editable={false}
              multiline
              scrollEnabled={false}
              style={[
                styles.viewField,
                { color: themeColors.text, backgroundColor: themeColors.cardBackground },
              ]}
            />
          </ScrollView>
        </Dialog.Content>
        <Dialog.Actions>
          <TouchableOpacity onPress={() => setViewSkill(null)}>
            <Text style={[styles.linkText, { color: themeColors.primary }]}>Close</Text>
          </TouchableOpacity>
        </Dialog.Actions>
      </Dialog>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteText: {
    fontSize: 13,
    marginTop: 8,
    marginBottom: 4,
  },
  multiBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  multiLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  tabRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
    marginBottom: 10,
  },
  tabText: {
    fontSize: 15,
  },
  searchInput: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  countText: {
    fontSize: 13,
  },
  topActions: {
    flexDirection: 'row',
    gap: 12,
  },
  linkText: {
    fontSize: 14,
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: 24,
    gap: 8,
  },
  skillRow: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    gap: 8,
  },
  dimRow: {
    opacity: 0.5,
  },
  pickWrap: {
    paddingTop: 2,
  },
  skillMain: {
    flex: 1,
    gap: 8,
  },
  skillTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  skillText: {
    flex: 1,
    gap: 4,
  },
  skillName: {
    fontSize: 15,
    fontWeight: '600',
  },
  skillDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 14,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  addRow: {
    borderRadius: 8,
    padding: 14,
    marginTop: 8,
  },
  addTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  dialogInput: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginTop: 8,
  },
  viewScroll: {
    maxHeight: 420,
  },
  viewDesc: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
  },
  viewHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  viewLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  viewField: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    lineHeight: 20,
    minHeight: 140,
    textAlignVertical: 'top',
  },
});
