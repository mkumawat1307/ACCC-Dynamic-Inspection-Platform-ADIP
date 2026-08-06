import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { buildWatermarkRendererPage } from "@/src/utils/watermarkHtml";

interface Props {
  webViewRef: React.RefObject<WebView | null>;
  onMessage: (event: any) => void;
  onLoadEnd?: () => void;
  onRenderProcessGone?: (event: any) => void;
}

export default function WatermarkMergeWebView({
  webViewRef,
  onMessage,
  onLoadEnd,
  onRenderProcessGone,
}: Props) {
  const html = useMemo(() => buildWatermarkRendererPage(), []);
  return (
    <View
      testID="watermarkRenderer"
      style={styles.watermarkContainer}
      pointerEvents="none"
    >
      <WebView
        ref={webViewRef}
        source={{ html }}
        style={styles.watermarkWebView}
        pointerEvents="none"
        javaScriptEnabled
        originWhitelist={["*"]}
        onMessage={onMessage}
        onLoadEnd={onLoadEnd}
        onRenderProcessGone={onRenderProcessGone}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  watermarkContainer: {
    position: "absolute",
    top: -9999,
    width: 1,
    height: 1,
  },
  watermarkWebView: {
    width: 1,
    height: 1,
  },
});
