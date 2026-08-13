jest.mock("react-native-webview", () => ({
  WebView: (props: {
    testID?: string;
    source?: { html?: string };
    onLoadEnd?: () => void;
    onMessage?: () => void;
    onRenderProcessGone?: () => void;
    pointerEvents?: string;
  }) => {
    const { View } = require("react-native");
    return (
      <View
        testID={props.testID ?? "wv"}
        source={props.source}
        onLoadEnd={props.onLoadEnd}
        onMessage={props.onMessage}
        onRenderProcessGone={props.onRenderProcessGone}
        pointerEvents={props.pointerEvents}
      />
    );
  },
}));

import React from "react";
import TestRenderer from "react-test-renderer";
import { WebView } from "react-native-webview";
import WatermarkMergeWebView from "@/src/components/camera/WatermarkMergeWebView";
import { buildWatermarkRendererPage } from "@/src/utils/watermarkHtml";

describe("WatermarkMergeWebView", () => {
  it("renders the persistent hidden WebView even before any photo", async () => {
    const ref = React.createRef<WebView>();
    let tree!: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <WatermarkMergeWebView webViewRef={ref} onMessage={() => {}} />
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

  it("loads the static renderer page exactly once", async () => {
    const ref = React.createRef<WebView>();
    let tree!: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <WatermarkMergeWebView webViewRef={ref} onMessage={() => {}} />
      );
    });
    const wv = tree.root.find(
      (i) => i.props.testID === "wv" && typeof (i as { type?: unknown }).type === "string"
    ) as unknown as {
      props: {
        testID: string;
        source: { html?: string };
        onLoadEnd: () => void;
        onMessage: () => void;
      };
    };
    expect(wv.props.source.html).toBe(buildWatermarkRendererPage());
    const firstSource = wv.props.source;
    await TestRenderer.act(async () => {
      tree.update(<WatermarkMergeWebView webViewRef={ref} onMessage={() => {}} />);
    });
    const wv2 = tree.root.find(
      (i) => i.props.testID === "wv" && typeof (i as { type?: unknown }).type === "string"
    ) as unknown as {
      props: { source: { html?: string } };
    };
    expect(wv2.props.source.html).toBe(firstSource.html);
    await TestRenderer.act(async () => {
      tree.unmount();
    });
  });

  it("forwards onLoadEnd and onMessage to the WebView", async () => {
    const ref = React.createRef<WebView>();
    const onLoadEnd = jest.fn();
    const onMessage = jest.fn();
    let tree!: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <WatermarkMergeWebView
          webViewRef={ref}
          onMessage={onMessage}
          onLoadEnd={onLoadEnd}
        />
      );
    });
    const wv = tree.root.find(
      (i) => i.props.testID === "wv" && typeof (i as { type?: unknown }).type === "string"
    ) as unknown as {
      props: {
        testID: string;
        source: { html?: string };
        onLoadEnd: () => void;
        onMessage: () => void;
      };
    };
    expect(typeof wv.props.onLoadEnd).toBe("function");
    expect(typeof wv.props.onMessage).toBe("function");
    wv.props.onLoadEnd();
    expect(onLoadEnd).toHaveBeenCalledTimes(1);
    await TestRenderer.act(async () => {
      tree.unmount();
    });
  });

  it("forwards onRenderProcessGone to the WebView for Android process-death detection", async () => {
    const ref = React.createRef<WebView>();
    const onRenderProcessGone = jest.fn();
    let tree!: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <WatermarkMergeWebView
          webViewRef={ref}
          onMessage={() => {}}
          onRenderProcessGone={onRenderProcessGone}
        />
      );
    });
    const wv = tree.root.find(
      (i) => i.props.testID === "wv" && typeof (i as { type?: unknown }).type === "string"
    ) as unknown as {
      props: { onRenderProcessGone: () => void };
    };
    expect(typeof wv.props.onRenderProcessGone).toBe("function");
    wv.props.onRenderProcessGone();
    expect(onRenderProcessGone).toHaveBeenCalledTimes(1);
    await TestRenderer.act(async () => {
      tree.unmount();
    });
  });

  it("is wrapped in a pointerEvents=none container so it never blocks touches on Android", async () => {
    const ref = React.createRef<WebView>();
    let tree!: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <WatermarkMergeWebView webViewRef={ref} onMessage={() => {}} />
      );
    });
    const container = tree.root.find(
      (i) =>
        i.props.testID === "watermarkRenderer" &&
        typeof (i as { type?: unknown }).type === "string"
    ) as unknown as { props: { pointerEvents?: string } };
    expect(container.props.pointerEvents).toBe("none");
    const wv = tree.root.find(
      (i) => i.props.testID === "wv" && typeof (i as { type?: unknown }).type === "string"
    ) as unknown as { props: { pointerEvents?: string } };
    expect(wv.props.pointerEvents).toBe("none");
    await TestRenderer.act(async () => {
      tree.unmount();
    });
  });
});
