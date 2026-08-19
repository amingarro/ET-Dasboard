import { Mail, GitBranch, GitCompareArrows, Kanban, Clock, type LucideIcon } from "lucide-react";

export interface ServiceDefinition {
  id: string;
  name: string;
  url: string;
  partition: string;
  icon: LucideIcon;
  color: string;
}

export const SERVICE_DEFINITIONS: ServiceDefinition[] = [
  {
    id: "gmail",
    name: "Gmail",
    url: "https://mail.google.com/mail/u/0/",
    partition: "persist:gmail",
    icon: Mail,
    color: "#ea4335",
  },
  {
    id: "github",
    name: "GitHub",
    url: "https://github.com",
    partition: "persist:github",
    icon: GitBranch,
    color: "#6e7781",
  },
  {
    id: "bitbucket",
    name: "Bitbucket",
    url: "https://bitbucket.org",
    partition: "persist:bitbucket",
    icon: GitCompareArrows,
    color: "#0052cc",
  },
  {
    id: "trello",
    name: "Trello",
    url: "https://trello.com/u/amingarro/boards",
    partition: "persist:trello",
    icon: Kanban,
    color: "#0079bf",
  },
  {
    id: "harvest",
    name: "Harvest",
    url: "https://kurobits.harvestapp.com/time",
    partition: "persist:harvest",
    icon: Clock,
    color: "#fa5751",
  },
];

export function getServiceDefinition(id: string): ServiceDefinition | undefined {
  return SERVICE_DEFINITIONS.find((service) => service.id === id);
}
