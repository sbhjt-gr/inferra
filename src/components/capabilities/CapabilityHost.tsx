import React, { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useDialog } from '../../context/DialogContext';
import { toolApproval, type ApprovalRequest } from '../../services/capabilities/ToolApproval';
import { toolAuditStore } from '../../services/capabilities/ToolAuditStore';
import { toolPolicyStore } from '../../services/capabilities/ToolPolicyStore';
import { registerWebSearch } from '../../services/tools/WebSearchTool';
import { syncCapabilityTools } from '../../services/capabilities/CapabilitySync';

export default function CapabilityHost() {
  const { showDialog, hideDialog } = useDialog();

  useEffect(() => {
    console.log('capability_host_mount');
    let alive = true;
    const boot = async () => {
      await toolPolicyStore.load();
      await toolAuditStore.load();
      registerWebSearch();
      if (alive) {
        await syncCapabilityTools();
      }
    };
    boot().catch(() => console.log('capability_boot_fail'));

    const unsubPolicy = toolPolicyStore.subscribe(() => {
      syncCapabilityTools().catch(() => console.log('capability_sync_fail'));
    });

    toolApproval.setPresenter(async (request: ApprovalRequest) => {
      console.log('capability_approve_prompt', request.tool);
      return new Promise<boolean>(resolve => {
        showDialog({
          title: 'Allow tool?',
          message: `${request.tool} (${request.risk})\n${request.summary}`,
          confirmText: 'Allow',
          cancelText: 'Deny',
          onConfirm: () => {
            hideDialog();
            resolve(true);
          },
          onCancel: () => {
            hideDialog();
            resolve(false);
          },
        });
      });
    });

    const onState = (next: AppStateStatus) => {
      toolApproval.setForeground(next === 'active');
    };
    const sub = AppState.addEventListener('change', onState);
    toolApproval.setForeground(AppState.currentState === 'active');

    return () => {
      alive = false;
      unsubPolicy();
      toolApproval.setPresenter(null);
      sub.remove();
      console.log('capability_host_unmount');
    };
  }, [hideDialog, showDialog]);

  return null;
}
