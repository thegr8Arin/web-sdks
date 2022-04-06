import React, { useCallback, useMemo, Fragment } from "react";
import { useMedia } from "react-use";
import {
  useHMSStore,
  useHMSActions,
  selectPeers,
  selectLocalPeer,
  selectPeerScreenSharing,
  selectPeerSharingVideoPlaylist,
  selectScreenShareByPeerID,
} from "@100mslive/react-sdk";
import { Box, Flex, config as cssConfig } from "@100mslive/react-ui";
import { ChatView } from "../components/chatView";
import { ScreenshareDisplay } from "../components/ScreenshareDisplay";
import ScreenshareTile from "../components/ScreenshareTile";
import VideoList from "../components/VideoList";
import VideoTile from "../components/VideoTile";
import { VideoPlayer } from "../components/Playlist/VideoPlayer";
import { mobileChatStyle } from "../common/utils";

const ScreenShareView = ({
  showStats,
  isChatOpen,
  toggleChat,
  isAudioOnly,
}) => {
  // for smaller screen we will show sidebar in bottom
  const mediaQueryLg = cssConfig.media.lg;
  const showSidebarInBottom = useMedia(mediaQueryLg);
  const peers = useHMSStore(selectPeers);
  const localPeer = useHMSStore(selectLocalPeer);
  const peerPresenting = useHMSStore(selectPeerScreenSharing);
  const peerSharingPlaylist = useHMSStore(selectPeerSharingVideoPlaylist);
  const isPresenterFromMyRole =
    peerPresenting?.roleName?.toLowerCase() ===
    localPeer?.roleName?.toLowerCase();
  const amIPresenting = localPeer && localPeer.id === peerPresenting?.id;
  const showPresenterInSmallTile =
    showSidebarInBottom || amIPresenting || isPresenterFromMyRole;

  const smallTilePeers = useMemo(() => {
    const smallTilePeers = peers.filter(peer => peer.id !== peerPresenting?.id);
    if (showPresenterInSmallTile && peerPresenting) {
      smallTilePeers.unshift(peerPresenting); // put presenter on first page
    }
    return smallTilePeers;
  }, [peers, peerPresenting, showPresenterInSmallTile]);

  return (
    <Flex
      css={{
        size: "100%",
      }}
      direction={showSidebarInBottom ? "column" : "row"}
    >
      <ScreenShareComponent
        showStats={showStats}
        amIPresenting={amIPresenting}
        peerPresenting={peerPresenting}
        peerSharingPlaylist={peerSharingPlaylist}
        isAudioOnly={isAudioOnly}
      />
      <Flex
        direction={{ "@initial": "column", "@lg": "row" }}
        css={{
          overflow: "hidden",
          p: "$4",
          flex: "0 0 20%",
          "@lg": {
            flex: "1 1 0",
          },
        }}
      >
        <SidePane
          showSidebarInBottom={showSidebarInBottom}
          showStats={showStats}
          isAudioOnly={isAudioOnly}
          isChatOpen={isChatOpen}
          toggleChat={toggleChat}
          peerScreenSharing={peerPresenting}
          isPresenterInSmallTiles={showPresenterInSmallTile}
          smallTilePeers={smallTilePeers}
          totalPeers={peers.length}
        />
      </Flex>
    </Flex>
  );
};

// Sidepane will show the camera stream of the main peer who is screensharing
// and both camera + screen(if applicable) of others
export const SidePane = ({
  showStats,
  isAudioOnly,
  isChatOpen,
  toggleChat,
  isPresenterInSmallTiles,
  peerScreenSharing, // the peer who is screensharing
  smallTilePeers,
  totalPeers,
  showSidebarInBottom,
}) => {
  // The main peer's screenshare is already being shown in center view
  const shouldShowScreenFn = useCallback(
    peer => peerScreenSharing && peer.id !== peerScreenSharing.id,
    [peerScreenSharing]
  );
  return (
    <Fragment>
      {!isPresenterInSmallTiles && (
        <LargeTilePeerView
          peerScreenSharing={peerScreenSharing}
          isChatOpen={isChatOpen}
          showStatsOnTiles={showStats}
          isAudioOnly={isAudioOnly}
        />
      )}
      <SmallTilePeersView
        showSidebarInBottom={showSidebarInBottom}
        isChatOpen={isChatOpen}
        smallTilePeers={smallTilePeers}
        shouldShowScreenFn={shouldShowScreenFn}
        showStatsOnTiles={showStats}
        isAudioOnly={isAudioOnly}
      />
      <CustomChatView
        isChatOpen={isChatOpen}
        toggleChat={toggleChat}
        totalPeers={totalPeers}
      />
    </Fragment>
  );
};

const ScreenShareComponent = ({
  showStats,
  isAudioOnly,
  amIPresenting,
  peerPresenting,
  peerSharingPlaylist,
}) => {
  const hmsActions = useHMSActions();
  const screenshareTrack = useHMSStore(
    selectScreenShareByPeerID(peerPresenting?.id)
  );

  if (peerSharingPlaylist) {
    return (
      <Box
        css={{
          mx: "$4",
          flex: "3 1 0",
          "@lg": {
            flex: "2 1 0",
            display: "flex",
            alignItems: "center",
          },
        }}
      >
        <VideoPlayer peerId={peerSharingPlaylist.id} />
      </Box>
    );
  }

  return (
    <Box
      css={{
        flex: "3 1 0",
        mx: "$4",
        ml: "$5",
        "@lg": { ml: "$4" },
      }}
    >
      {peerPresenting &&
        (amIPresenting &&
        !["browser", "window", "application"].includes(
          screenshareTrack?.displaySurface
        ) ? (
          <Box css={{ objectFit: "contain", h: "100%" }}>
            <ScreenshareDisplay
              stopScreenShare={async () => {
                await hmsActions.setScreenShareEnabled(false);
              }}
              classes={{ rootBg: "h-full" }}
            />
          </Box>
        ) : (
          <ScreenshareTile
            showStatsOnTiles={showStats}
            isAudioOnly={isAudioOnly}
            peerId={peerPresenting?.id}
          />
        ))}
    </Box>
  );
};

const CustomChatView = ({ isChatOpen, toggleChat }) => {
  return (
    isChatOpen && (
      <Box
        css={{
          h: "45%",
          flexShrink: 0,
          "@lg": mobileChatStyle,
          "@ls": {
            position: "absolute",
            top: 0,
            h: "100%",
            minHeight: 300,
            zIndex: 40,
          },
        }}
      >
        <ChatView toggleChat={toggleChat} />
      </Box>
    )
  );
};

const SmallTilePeersView = ({
  smallTilePeers,
  shouldShowScreenFn,
  showStatsOnTiles,
  showSidebarInBottom,
  isAudioOnly,
}) => {
  return (
    <Flex
      css={{
        flex: "2 1 0",
      }}
    >
      {smallTilePeers && smallTilePeers.length > 0 && (
        <VideoList
          peers={smallTilePeers}
          maxColCount={showSidebarInBottom ? undefined : 2}
          maxRowCount={showSidebarInBottom ? 1 : undefined}
          includeScreenShareForPeer={shouldShowScreenFn}
          showStatsOnTiles={showStatsOnTiles}
          isAudioOnly={isAudioOnly}
        />
      )}
    </Flex>
  );
};

const LargeTilePeerView = ({
  peerScreenSharing,
  showStatsOnTiles,
  isAudioOnly,
}) => {
  return peerScreenSharing ? (
    <Box
      css={{
        flex: "1 1 0",
        minHeight: "25%",
        py: "$4",
        "@lg": {
          mr: "$4",
          minHeight: "unset",
          py: 0,
        },
        "@sm": {
          height: "100%",
          maxHeight: "75%",
          alignSelf: "center",
        },
      }}
    >
      <VideoTile
        showStatsOnTiles={showStatsOnTiles}
        width="100%"
        height="100%"
        isAudioOnly={isAudioOnly}
        peerId={peerScreenSharing.id}
      />
    </Box>
  ) : null;
};

export default ScreenShareView;
