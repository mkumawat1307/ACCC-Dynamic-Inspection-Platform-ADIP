import React from "react";
import { StyleSheet } from "react-native";
import { WebView } from "react-native-webview";

interface Props {
  html: string | null;
  webViewRef: React.RefObject<WebView | null>;
  onMessage: (event: any) => void;
}

export default function WatermarkMergeWebView({
  html,
  webViewRef,
  onMessage,
}: Props) {
  if (!html) return null;
  return (
    <WebView
      ref={webViewRef}
      source={{ html }}
      style={styles.watermarkWebView}
      javaScriptEnabled
      originWhitelist={["*"]}
      onMessage={onMessage}
    />
  );
}

const styles = StyleSheet.create({
  watermarkWebView: {
    position: "absolute",
    top: -9999,
    width: 1,
    height: 1,
  },
});
