import React, { Fragment, useEffect, useRef, useState } from 'react';
import { HMSHLSPlayer } from '@100mslive/hls-player';
import {
  ConferencingScreen,
  DefaultConferencingScreen_Elements,
  HLSLiveStreamingScreen_Elements,
} from '@100mslive/types-prebuilt';
import { match } from 'ts-pattern';
import {
  HMSTranscriptionMode,
  selectAppData,
  selectIsTranscriptionAllowedByMode,
  selectIsTranscriptionEnabled,
  selectLocalPeerID,
  useHMSActions,
  useHMSStore,
} from '@100mslive/react-sdk';
import {
  BrbIcon,
  CheckIcon,
  ExternalLinkIcon,
  HamburgerMenuIcon,
  InfoIcon,
  OpenCaptionIcon,
  PipIcon,
  SettingsIcon,
} from '@100mslive/react-icons';
import { Checkbox, Dropdown, Flex, getCssText, Switch, Text, Tooltip } from '../../../..';
import IconButton from '../../../IconButton';
// @ts-ignore: No implicit any
import { PIP } from '../../PIP';
import { PIPChat } from '../../PIP/PIPChat';
// @ts-ignore: No implicit any
import { PictureInPicture } from '../../PIP/PIPManager';
import { PIPWindow } from '../../PIP/PIPWindow';
// @ts-ignore: No implicit any
import { RoleChangeModal } from '../../RoleChangeModal';
// @ts-ignore: No implicit any
import SettingsModal from '../../Settings/SettingsModal';
// @ts-ignore: No implicit any
import StartRecording from '../../Settings/StartRecording';
// @ts-ignore: No implicit any
import { StatsForNerds } from '../../StatsForNerds';
// @ts-ignore: No implicit any
import { BulkRoleChangeModal } from '../BulkRoleChangeModal';
import { CaptionModal } from '../CaptionModal';
// @ts-ignore: No implicit any
import { FullScreenItem } from '../FullScreenItem';
import { MuteAllModal } from '../MuteAllModal';
// @ts-ignore: No implicit any
import { useDropdownList } from '../../hooks/useDropdownList';
import { useMyMetadata } from '../../hooks/useMetadata';
import { usePIPWindow } from '../../PIP/usePIPWindow';
// @ts-ignore: No implicit any
import { APP_DATA, isMacOS } from '../../../common/constants';

const MODALS = {
  CHANGE_NAME: 'changeName',
  SELF_ROLE_CHANGE: 'selfRoleChange',
  MORE_SETTINGS: 'moreSettings',
  START_RECORDING: 'startRecording',
  DEVICE_SETTINGS: 'deviceSettings',
  STATS_FOR_NERDS: 'statsForNerds',
  BULK_ROLE_CHANGE: 'bulkRoleChange',
  MUTE_ALL: 'muteAll',
  EMBED_URL: 'embedUrl',
  CAPTION: 'caption',
};

export const DesktopOptions = ({
  elements,
  screenType,
}: {
  elements: DefaultConferencingScreen_Elements & HLSLiveStreamingScreen_Elements;
  screenType: keyof ConferencingScreen;
}) => {
  const localPeerId = useHMSStore(selectLocalPeerID);
  const hmsActions = useHMSActions();
  const enablHlsStats = useHMSStore(selectAppData(APP_DATA.hlsStats));
  const [openModals, setOpenModals] = useState(new Set());
  const { isBRBOn, toggleBRB } = useMyMetadata();
  const isPipOn = PictureInPicture.isOn();
  const isBRBEnabled = !!elements?.brb;
  const isTranscriptionAllowed = useHMSStore(selectIsTranscriptionAllowedByMode(HMSTranscriptionMode.CAPTION));
  const isTranscriptionEnabled = useHMSStore(selectIsTranscriptionEnabled);
  const { isSupported, requestPipWindow, pipWindow, closePipWindow } = usePIPWindow();
  const sendFuncAdded = useRef<boolean>();
  const showPipChatOption = !!elements?.chat && isSupported;

  useDropdownList({ open: openModals.size > 0, name: 'MoreSettings' });

  useEffect(() => {
    if (document && pipWindow) {
      const style = document.createElement('style');
      style.id = 'stitches';
      style.textContent = getCssText();
      pipWindow.document.head.appendChild(style);
    }
  }, [pipWindow]);

  useEffect(() => {
    if (pipWindow) {
      const chatContainer = pipWindow.document.getElementById('chat-container');
      const selector = pipWindow.document.getElementsByTagName('select')[0];
      const sendBtn = pipWindow.document.getElementsByClassName('send-msg')[0];
      const pipChatInput = pipWindow.document.getElementsByTagName('textarea')[0];
      const marker = pipWindow.document.getElementById('marker');

      const mutationObserver = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
          if (mutation.addedNodes.length > 0) {
            const newMessages = mutation.addedNodes;
            newMessages.forEach(message => {
              const messageId = (message as Element)?.id;
              if (messageId === 'new-message-notif') {
                message.addEventListener('click', () => setTimeout(() => marker?.scrollIntoView({ block: 'end' }), 0));
              }
              const observer = new IntersectionObserver(
                entries => {
                  if (entries[0].isIntersecting && messageId) {
                    hmsActions.setMessageRead(true, messageId);
                    // Your logic to mark the message as read goes here
                  }
                },
                {
                  root: chatContainer,
                  threshold: 1.0,
                },
              );
              if (messageId) observer.observe(message as Element);
            });
          }
        });
      });
      mutationObserver.observe(chatContainer as Node, {
        childList: true,
      });

      const sendMessage = async () => {
        const selection = selector?.value || 'Everyone';
        if (selection === 'Everyone') {
          await hmsActions.sendBroadcastMessage(pipChatInput.value.trim());
        } else {
          await hmsActions.sendGroupMessage(pipChatInput.value.trim(), [selection]);
        }
        pipChatInput.value = '';
        setTimeout(() => marker?.scrollIntoView({ block: 'end' }), 0);
      };

      if (sendBtn && hmsActions && pipChatInput && !sendFuncAdded.current) {
        // remove on cleanup
        sendBtn.addEventListener('click', sendMessage);
        pipChatInput.addEventListener('keypress', e => {
          if (e.key === 'Enter') sendMessage();
        });
        sendFuncAdded.current = true;
      }
    } else {
      sendFuncAdded.current = false;
    }
  }, [pipWindow, hmsActions]);

  useEffect(() => {
    return () => {
      pipWindow && closePipWindow();
    };
  }, [closePipWindow, pipWindow]);

  const updateState = (modalName: string, value: boolean) => {
    setOpenModals(modals => {
      const copy = new Set(modals);
      if (value) {
        // avoiding extra set state trigger which removes currently open dialog by clearing set.
        copy.clear();
        copy.add(modalName);
      } else {
        copy.delete(modalName);
      }
      return copy;
    });
  };

  return (
    <Fragment>
      {isSupported && pipWindow ? (
        <PIPWindow pipWindow={pipWindow}>
          <PIPChat />
        </PIPWindow>
      ) : null}
      <Dropdown.Root
        open={openModals.has(MODALS.MORE_SETTINGS)}
        onOpenChange={value => updateState(MODALS.MORE_SETTINGS, value)}
        modal={false}
      >
        <Tooltip title="More options">
          <Dropdown.Trigger asChild data-testid="more_settings_btn">
            <IconButton>
              <HamburgerMenuIcon />
            </IconButton>
          </Dropdown.Trigger>
        </Tooltip>

        <Dropdown.Content
          sideOffset={5}
          align="end"
          css={{
            py: '$0',
            maxHeight: 'unset',
            '@md': { w: '$64' },
            "div[role='separator']:first-child": {
              display: 'none',
            },
          }}
        >
          {isBRBEnabled && screenType !== 'hls_live_streaming' ? (
            <Dropdown.Item onClick={toggleBRB} data-testid="brb_btn">
              <BrbIcon />
              <Text variant="sm" css={{ ml: '$4', color: '$on_surface_high' }}>
                Be Right Back
              </Text>
              <Flex justify="end" css={{ color: '$on_surface_high', flexGrow: '1' }}>
                {isBRBOn ? <CheckIcon /> : null}
              </Flex>
            </Dropdown.Item>
          ) : null}
          {isTranscriptionAllowed ? (
            <Dropdown.Item
              data-testid="closed_caption_admin"
              onClick={() => {
                updateState(MODALS.CAPTION, true);
              }}
            >
              <OpenCaptionIcon />
              <Flex direction="column" css={{ flexGrow: '1' }}>
                <Text variant="sm" css={{ ml: '$4', color: '$on_surface_high' }}>
                  Closed Captions
                </Text>
                <Text variant="caption" css={{ ml: '$4', color: '$on_surface_medium' }}>
                  {isTranscriptionEnabled ? 'Enabled' : 'Disabled'}
                </Text>
              </Flex>
              <Switch id="closed_caption_start_stop" checked={isTranscriptionEnabled} disabled={false} />
            </Dropdown.Item>
          ) : null}
          {screenType !== 'hls_live_streaming' ? (
            <Dropdown.Item css={{ p: 0, '&:empty': { display: 'none' } }}>
              <PIP
                content={
                  <Flex css={{ w: '100%', h: '100%', p: '$8' }}>
                    <PipIcon />
                    <Text variant="sm" css={{ ml: '$4' }}>
                      {isPipOn ? 'Disable' : 'Enable'} Picture-in-Picture
                    </Text>
                  </Flex>
                }
              />
            </Dropdown.Item>
          ) : null}

          {showPipChatOption && (
            <Dropdown.Item onClick={async () => await requestPipWindow(350, 500)} data-testid="brb_btn">
              <ExternalLinkIcon height={18} width={18} style={{ padding: '0 $2' }} />
              <Text variant="sm" css={{ ml: '$4', color: '$on_surface_high' }}>
                Pop out Chat
              </Text>
            </Dropdown.Item>
          )}

          <FullScreenItem />

          <Dropdown.ItemSeparator css={{ mx: 0 }} />

          <Dropdown.Item onClick={() => updateState(MODALS.DEVICE_SETTINGS, true)} data-testid="device_settings_btn">
            <SettingsIcon />
            <Text variant="sm" css={{ ml: '$4' }}>
              Settings
            </Text>
          </Dropdown.Item>
          {match({ screenType, isSupported: HMSHLSPlayer.isSupported() })
            .with({ screenType: 'hls_live_streaming', isSupported: false }, () => null)
            .with({ screenType: 'hls_live_streaming', isSupported: true }, () => {
              return (
                <Dropdown.Item
                  onClick={() => hmsActions.setAppData(APP_DATA.hlsStats, !enablHlsStats)}
                  data-testid="hls_stats"
                >
                  <Checkbox.Root
                    css={{ margin: '$2' }}
                    checked={enablHlsStats}
                    onCheckedChange={() => hmsActions.setAppData(APP_DATA.hlsStats, !enablHlsStats)}
                  >
                    <Checkbox.Indicator>
                      <CheckIcon width={16} height={16} />
                    </Checkbox.Indicator>
                  </Checkbox.Root>
                  <Flex justify="between" css={{ width: '100%' }}>
                    <Text variant="sm" css={{ ml: '$4' }}>
                      Show HLS Stats
                    </Text>

                    <Text variant="sm" css={{ ml: '$4' }}>
                      {`${isMacOS ? '⌘' : 'ctrl'} + ]`}
                    </Text>
                  </Flex>
                </Dropdown.Item>
              );
            })
            .otherwise(() => (
              <Dropdown.Item
                onClick={() => updateState(MODALS.STATS_FOR_NERDS, true)}
                data-testid="stats_for_nerds_btn"
              >
                <InfoIcon />
                <Text variant="sm" css={{ ml: '$4' }}>
                  Stats for Nerds
                </Text>
              </Dropdown.Item>
            ))}
        </Dropdown.Content>
      </Dropdown.Root>
      {openModals.has(MODALS.BULK_ROLE_CHANGE) && (
        <BulkRoleChangeModal onOpenChange={(value: boolean) => updateState(MODALS.BULK_ROLE_CHANGE, value)} />
      )}
      {openModals.has(MODALS.MUTE_ALL) && (
        <MuteAllModal onOpenChange={(value: boolean) => updateState(MODALS.MUTE_ALL, value)} />
      )}

      {openModals.has(MODALS.START_RECORDING) && (
        <StartRecording open onOpenChange={(value: boolean) => updateState(MODALS.START_RECORDING, value)} />
      )}
      {openModals.has(MODALS.DEVICE_SETTINGS) && (
        <SettingsModal
          open
          onOpenChange={(value: boolean) => updateState(MODALS.DEVICE_SETTINGS, value)}
          screenType={screenType}
        />
      )}
      {openModals.has(MODALS.STATS_FOR_NERDS) && (
        <StatsForNerds open onOpenChange={(value: boolean) => updateState(MODALS.STATS_FOR_NERDS, value)} />
      )}
      {openModals.has(MODALS.SELF_ROLE_CHANGE) && (
        <RoleChangeModal
          peerId={localPeerId}
          onOpenChange={(value: boolean) => updateState(MODALS.SELF_ROLE_CHANGE, value)}
        />
      )}
      {openModals.has(MODALS.CAPTION) && (
        <CaptionModal onOpenChange={(value: boolean) => updateState(MODALS.CAPTION, value)} />
      )}
      {/* {openModals.has(MODALS.EMBED_URL) && (
        <EmbedUrlModal onOpenChange={value => updateState(MODALS.EMBED_URL, value)} />
      )} */}
    </Fragment>
  );
};
