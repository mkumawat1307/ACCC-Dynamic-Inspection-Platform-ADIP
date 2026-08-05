jest.mock("react-native-webview", () => ({
  WebView: (props: { testID?: string }) => {
    const { View } = require("react-native");
    return <View testID={props.testID ?? "wv"} />;
  },
}));

import React from "react";
import TestRenderer from "react-test-renderer";
import { WebView } from "react-native-webview";
import WatermarkMergeWebView from "@/src/components/camera/WatermarkMergeWebView";

describe("WatermarkMergeWebView", () => {
  it("renders the hidden WebView when html is provided", async () => {
    const ref = React.createRef<WebView>();
    let tree!: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <WatermarkMergeWebView html="<html></html>" webViewRef={ref} onMessage={() => {}} />
      );
    });
    expect(
      tree.root.findAll(
        (i) => i.props.testID === "wv" && typeof (i as { type?: unknown }).type === "string"
      )
    ).toHaveLength(1);
    await TestRenderer.act(async () => {
      tree.unmount();
    });
  });

  it("renders nothing when html is null", async () => {
    const ref = React.createRef<WebView>();
    let tree!: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <WatermarkMergeWebView html={null} webViewRef={ref} onMessage={() => {}} />
      );
    });
    expect(
      tree.root.findAll(
        (i) => i.props.testID === "wv" && typeof (i as { type?: unknown }).type === "string"
      )
    ).toHaveLength(0);
    await TestRenderer.act(async () => {
      tree.unmount();
    });
  });
});
