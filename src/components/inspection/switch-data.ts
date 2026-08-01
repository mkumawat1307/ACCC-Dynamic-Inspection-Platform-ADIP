export interface DropdownItem {
  label: string;
  value: string;
}

export const defaultOptions: Record<string, DropdownItem[]> = {
  SwitchType: [
    { label: "4-Port", value: "4-Port" },
    { label: "8-Port", value: "8-Port" },
  ],
  SwitchStatus: [
    { label: "VMS", value: "VMS" },
    { label: "Local", value: "Local" },
    { label: "Non-Live", value: "Non-Live" },
    { label: "In Stock", value: "In Stock" },
    { label: "Dismantled", value: "Dismantled" },
    { label: "Not Verified", value: "Not Verified" },
  ],
  SwitchMake: [
    { label: "D-Link", value: "D-Link" },
    { label: "Cisco", value: "Cisco" },
    { label: "Allied", value: "Allied" },
    { label: "Tejas", value: "Tejas" },
  ],
  SwitchSI: [
    { label: "Technosys (LSY)", value: "Technosys (LSY)" },
    { label: "TCIL (LSY)", value: "TCIL (LSY)" },
    { label: "TCIL (RC)", value: "TCIL (RC)" },
    { label: "TCIL (Smart City)", value: "TCIL (Smart City)" },
    { label: "TASL (Technosys)", value: "TASL (Technosys)" },
  ],
};
