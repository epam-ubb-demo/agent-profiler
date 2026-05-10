import * as pulumi from "@pulumi/pulumi";

export interface TagArgs {
  environment: string;
}

export function createTags(args: TagArgs): Record<string, string> {
  return {
    environment: args.environment,
    project: "agent-profiler",
    component: "otel-gateway",
    "cost-centre": "ubb-capabilities",
    "managed-by": "pulumi",
    "data-classification": "internal",
  };
}

// Register a stack transformation that auto-applies tags to all taggable resources
export function registerAutoTagging(tags: Record<string, string>): void {
  pulumi.runtime.registerStackTransformation((args) => {
    if ("tags" in args.props) {
      args.props["tags"] = { ...tags, ...args.props["tags"] };
    }
    return { props: args.props, opts: args.opts };
  });
}
