import React from 'react';
import { useMedia } from 'react-use';
import { ConferencingScreen } from '@100mslive/types-prebuilt';
import { selectAppData, selectVideoTrackByPeerID, useHMSStore } from '@100mslive/react-sdk';
// @ts-ignore: No implicit Any
import { Chat } from '../components/Chat/Chat';
// @ts-ignore: No implicit Any
import { ParticipantList } from '../components/Footer/ParticipantList';
// @ts-ignore: No implicit Any
import { StreamingLanding } from '../components/Streaming/StreamingLanding';
// @ts-ignore: No implicit Any
import VideoTile from '../components/VideoTile';
import { Box, Flex } from '../../Layout';
import { config as cssConfig } from '../../Theme';
import { useRoomLayoutConferencingScreen } from '../provider/roomLayoutProvider/hooks/useRoomLayoutScreen';
// @ts-ignore: No implicit Any
import { APP_DATA, SIDE_PANE_OPTIONS } from '../common/constants';

const SidePane = ({ screenType }: { screenType: keyof ConferencingScreen }) => {
  const isMobile = useMedia(cssConfig.media.md);
  const sidepane = useHMSStore(selectAppData(APP_DATA.sidePane));
  const activeScreensharePeerId = useHMSStore(selectAppData(APP_DATA.activeScreensharePeerId));
  const trackId = useHMSStore(selectVideoTrackByPeerID(activeScreensharePeerId))?.id;
  const { elements } = useRoomLayoutConferencingScreen();
  let ViewComponent;
  if (sidepane === SIDE_PANE_OPTIONS.PARTICIPANTS) {
    ViewComponent = <ParticipantList />;
  } else if (sidepane === SIDE_PANE_OPTIONS.CHAT) {
    ViewComponent = <Chat screenType={screenType} />;
  } else if (sidepane === SIDE_PANE_OPTIONS.STREAMING) {
    ViewComponent = <StreamingLanding />;
  }
  if (!ViewComponent && !trackId) {
    return null;
  }

  const mwebStreamingChat = isMobile && sidepane === SIDE_PANE_OPTIONS.CHAT && elements?.chat?.is_overlay;

  return (
    <Flex
      direction="column"
      justify="center"
      css={{
        w: '$100',
        h: '100%',
        flexShrink: 0,
        gap: '$4',
        '@md': { position: mwebStreamingChat ? 'absolute' : '', zIndex: 12 },
      }}
    >
      {trackId && (
        <VideoTile
          peerId={activeScreensharePeerId}
          trackId={trackId}
          width="100%"
          height={225}
          rootCSS={{ p: 0, alignSelf: 'start', flexShrink: 0 }}
          objectFit="contain"
        />
      )}
      {!!ViewComponent && (
        <Box
          css={{
            w: '$100',
            h: mwebStreamingChat ? '0' : '100%',
            p: '$10',
            flex: '1 1 0',
            minHeight: 0,
            maxHeight: mwebStreamingChat ? '300px' : 'unset',
            background: mwebStreamingChat
              ? 'linear-gradient(180deg, rgba(0, 0, 0, 0.00) 35.94%, rgba(0, 0, 0, 0.64) 100%)'
              : '$surface_dim',
            r: '$1',
            position: 'relative',
            '@lg': {
              w: '100%',
              h: '100%',
              ml: 0,
              right: 0,
              position: 'fixed',
              bottom: 0,
              borderRadius: 0,
              zIndex: 10,
            },
            '@md': {
              p: '$6 $8',
              pb: mwebStreamingChat ? '$20' : '$12',
            },
          }}
        >
          {ViewComponent}
        </Box>
      )}
    </Flex>
  );
};

export default SidePane;