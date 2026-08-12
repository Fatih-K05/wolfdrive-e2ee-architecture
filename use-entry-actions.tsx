import {
  createShareableLinkOptions,
  unshareEntriesOptions,
} from '@app/app-queries';
import {SharesPage, TrashPage} from '@app/drive/drive-page/drive-page';
import {driveState, useDriveStore} from '@app/drive/drive-store';
import {EntryAction} from '@app/drive/entry-actions/entry-action';
import {
  getDirectLink,
  getShareableLink,
} from '@app/drive/entry-actions/get-public-access-link';
import {useAddStarToEntries} from '@app/drive/files/queries/use-add-star-to-entries';
import {useDeleteEntries} from '@app/drive/files/queries/use-delete-entries';
import {useDuplicateEntries} from '@app/drive/files/queries/use-duplicate-entries';
import {useRemoveStarFromEntries} from '@app/drive/files/queries/use-remove-star-from-entries';
import {useRestoreEntries} from '@app/drive/files/queries/use-restore-entries';
import {DriveEntry} from '@app/gen/schemas/drive-entry';
import {auth} from '@common/auth/use-auth';
import {showHttpErrorToast} from '@common/http/errors/show-http-error-toast';
import {useFileEntryUrls} from '@common/uploads/file-entry-urls';
import {toast} from '@shadcn/toast/toast';
import {useMutation} from '@tanstack/react-query';
import {Trans} from '@ui/i18n/trans';
import {useSettings} from '@ui/settings/use-settings';
import {downloadFileFromUrl} from '@ui/utils/files/download-file-from-url';
import copy from 'copy-to-clipboard';
import {
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  FolderInputIcon,
  LinkIcon,
  PencilIcon,
  RotateCcwIcon,
  StarIcon,
  StarOffIcon,
  TrashIcon,
  UserPlusIcon,
} from 'lucide-react';

export function useEntryActions(entries: DriveEntry[]): EntryAction[] {
  const preview = usePreviewAction(entries);
  const share = useShareAction(entries);
  const copyLink = useCopyLinkAction(entries);
  const addStar = useAddToStarredAction(entries);
  const removeStar = useRemoveFromStarred(entries);
  const moveTo = useMoveToAction(entries);
  const rename = useRenameAction(entries);
  const makeCopy = useMakeCopyAction(entries);
  const download = useDownloadEntriesAction(entries);
  const deleteAction = useDeleteEntriesAction(entries);
  const removeSharedEntries = useRemoveSharedEntriesAction(entries);
  const restoreEntries = useRestoreEntriesAction(entries);

  return [
    preview,
    share,
    copyLink,
    addStar,
    removeStar,
    moveTo,
    rename,
    makeCopy,
    download,
    deleteAction,
    removeSharedEntries,
    restoreEntries,
  ].filter(action => !!action) as EntryAction[];
}

export function usePreviewAction(
  entries: DriveEntry[],
): EntryAction | undefined {
  if (!entries.some(e => e.type !== 'folder')) return;
  return {
    label: <Trans message="Preview" />,
    icon: <EyeIcon />,
    key: 'preview',
    execute: () => {
      driveState().setActiveActionDialog('preview', entries);
    },
  };
}

export function useShareAction(entries: DriveEntry[]): EntryAction | undefined {
  const activePage = useDriveStore(s => s.activePage);
  if (
    entries.length > 1 ||
    !entries.every(e => e.permissions?.['files.update']) ||
    activePage === TrashPage
  )
    return;

  return {
    label: <Trans message="Share" />,
    icon: <UserPlusIcon />,
    key: 'share',
    execute: () => {
      driveState().setActiveActionDialog('share', entries);
    },
  };
}

function useCopyLinkAction(entries: DriveEntry[]): EntryAction | undefined {
  const activePage = useDriveStore(s => s.activePage);
  const {drive} = useSettings();
  const createLink = useMutation(createShareableLinkOptions(entries[0].id));
  if (
    entries.length > 1 ||
    !entries.every(e => e.permissions?.['files.update']) ||
    activePage === TrashPage
  ) {
    return;
  }
  return {
    label: <Trans message="Copy link" />,
    icon: <LinkIcon />,
    key: 'copyLink',
    execute: async () => {
      const isUsingDirectLinks =
        drive?.copy_link_default === 'direct' && entries[0].type !== 'folder';
      const r = await createLink.mutateAsync({
        enable_direct_links: isUsingDirectLinks,
      });
      if (r.data) {
        const publicLink = isUsingDirectLinks
          ? getDirectLink(r.data, entries[0])
          : getShareableLink(r.data);
        copy(publicLink);
        toast.success(<Trans message="Link copied" />, {
          actionProps: {
            children: <Trans message="Manage access" />,
            onClick: () => {
              driveState().setActiveActionDialog('share', entries);
            },
          },
        });
      } else {
        toast.error(<Trans message="Could not create link" />);
      }
    },
  };
}

function useAddToStarredAction(entries: DriveEntry[]): EntryAction | undefined {
  const activePage = useDriveStore(s => s.activePage);
  const starEntries = useAddStarToEntries();
  if (
    entries.every(e => e.starred) ||
    !entries.every(e => e.permissions?.['files.view']) ||
    activePage === TrashPage
  ) {
    return;
  }
  return {
    label: <Trans message="Add to starred" />,
    icon: <StarIcon />,
    key: 'addToStarred',
    execute: () => {
      starEntries.mutate({entryIds: entries.map(e => e.id)});
      driveState().selectEntries([]);
    },
  };
}

function useRemoveFromStarred(entries: DriveEntry[]): EntryAction | undefined {
  const activePage = useDriveStore(s => s.activePage);
  const removeStar = useRemoveStarFromEntries();
  if (!entries.every(e => e.starred) || activePage === TrashPage) {
    return;
  }

  return {
    label: <Trans message="Remove from starred" />,
    icon: <StarOffIcon />,
    key: 'removeFromStarred',
    execute: () => {
      removeStar.mutate({entryIds: entries.map(e => e.id)});
      driveState().selectEntries([]);
    },
  };
}

function useMoveToAction(entries: DriveEntry[]): EntryAction | undefined {
  const activePage = useDriveStore(s => s.activePage);
  if (
    !entries.every(e => e.permissions?.['files.update']) ||
    activePage === SharesPage ||
    activePage === TrashPage
  ) {
    return;
  }

  return {
    label: <Trans message="Move to" />,
    icon: <FolderInputIcon />,
    key: 'moveTo',
    execute: () => {
      driveState().setActiveActionDialog('moveTo', entries);
    },
  };
}

function useRenameAction(entries: DriveEntry[]): EntryAction | undefined {
  const activePage = useDriveStore(s => s.activePage);
  if (
    entries.length > 1 ||
    !entries.every(e => e.permissions?.['files.update']) ||
    activePage === TrashPage
  )
    return;
  return {
    label: <Trans message="Rename" />,
    icon: <PencilIcon />,
    key: 'rename',
    execute: () => {
      driveState().setActiveActionDialog('rename', entries);
    },
  };
}

function useMakeCopyAction(entries: DriveEntry[]): EntryAction | undefined {
  const activePage = useDriveStore(s => s.activePage);
  const duplicateEntries = useDuplicateEntries();
  if (
    entries.length > 1 ||
    !entries.every(e => e.permissions?.['files.create']) ||
    activePage === TrashPage
  ) {
    return;
  }
  return {
    label: <Trans message="Make a copy" />,
    icon: <CopyIcon />,
    key: 'makeCopy',
    execute: () => {
      duplicateEntries.mutate({
        entryIds: entries.map(e => e.id),
        destinationId: activePage?.folder?.id,
      });
      driveState().selectEntries([]);
    },
  };
}

function useDownloadEntriesAction(
  entries: DriveEntry[],
): EntryAction | undefined {
  const {downloadUrl} = useFileEntryUrls(entries[0], {
    downloadHashes: entries.map(e => e.hash),
  });
  if (!entries.every(e => e.permissions?.['files.download'])) return;
  return {
    label: <Trans message="Download" />,
    icon: <DownloadIcon />,
    key: 'download',
    execute: async () => {
      if (downloadUrl) {
        if (entries.length === 1 && entries[0].encryption_key && entries[0].encryption_iv) {
           const { importKey, decryptFile } = await import('@app/drive/crypto/crypto-utils');
           const toastId = toast.loading("Downloading and decrypting...");
           try {
               const res = await fetch(downloadUrl);
               const encryptedBuffer = await res.arrayBuffer();
               const key = await importKey(entries[0].encryption_key);
               const decryptedBlob = await decryptFile(encryptedBuffer, key, entries[0].encryption_iv);
               
               const objectUrl = URL.createObjectURL(decryptedBlob);
               const link = document.createElement('a');
               link.href = objectUrl;
               link.download = entries[0].name;
               link.click();
               URL.revokeObjectURL(objectUrl);
               toast.success("Decrypted successfully", {id: toastId});
           } catch(e) {
               toast.error("Decryption failed", {id: toastId});
           }
        } else {
           downloadFileFromUrl(downloadUrl);
        }
      }
      driveState().selectEntries([]);
    },
  };
}

export function useDeleteEntriesAction(
  entries: DriveEntry[],
): EntryAction | undefined {
  const deleteEntries = useDeleteEntries();
  const activePage = useDriveStore(s => s.activePage);
  if (
    activePage === SharesPage ||
    !entries.every(e => e.permissions?.['files.delete'])
  )
    return;
  return {
    label:
      activePage === TrashPage ? (
        <Trans message="Delete forever" />
      ) : (
        <Trans message="Remove" />
      ),
    icon: <TrashIcon />,
    key: 'delete',
    execute: () => {
      if (activePage === TrashPage) {
        driveState().setActiveActionDialog('confirmAndDeleteForever', entries);
      } else {
        deleteEntries.mutate({
          entryIds: entries.map(e => e.id),
          deleteForever: activePage === TrashPage,
        });
        driveState().selectEntries([]);
      }
    },
  };
}

export function useRestoreEntriesAction(
  entries: DriveEntry[],
): EntryAction | undefined {
  const restoreEntries = useRestoreEntries();
  const activePage = useDriveStore(s => s.activePage);
  if (
    activePage !== TrashPage ||
    !entries.every(e => e.permissions?.['files.delete'])
  )
    return;
  return {
    label: <Trans message="Restore" />,
    icon: <RotateCcwIcon />,
    key: 'restore',
    execute: () => {
      restoreEntries.mutate({
        entryIds: entries.map(e => e.id),
      });
      driveState().selectEntries([]);
    },
  };
}

export function useRemoveSharedEntriesAction(
  entries: DriveEntry[],
): EntryAction | undefined {
  const unshareEntries = useMutation(unshareEntriesOptions());
  const activePage = useDriveStore(s => s.activePage);
  if (activePage !== SharesPage) return;
  return {
    label: <Trans message="Remove" />,
    icon: <TrashIcon />,
    key: 'removeSharedEntry',
    execute: () => {
      unshareEntries.mutate(
        {entry_ids: entries.map(e => e.id), user_id: auth.user!.id},
        {
          onSuccess: () => {
            toast.success(
              <Trans
                message="Removed [one 1 item|other {count} items]"
                values={{count: entries.length}}
              />,
            );
          },
          onError: err =>
            showHttpErrorToast(err, <Trans message="Could not remove items" />),
        },
      );
      driveState().selectEntries([]);
    },
  };
}
