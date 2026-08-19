export interface FieldOptionSeed {
  FieldKey: string;
  OptionLabel: string;
  OptionValue: string;
  DisplayOrder: number;
  IsDefault?: number;
}

export const fieldOptions: FieldOptionSeed[] = [

  // =====================================================
  // Foundation Condition (foundation_cond)
  // =====================================================

  {
    FieldKey: "foundation_cond",
    OptionLabel: "Acceptable",
    OptionValue: "Acceptable",
    DisplayOrder: 1,
  },
  {
    FieldKey: "foundation_cond",
    OptionLabel: "Minor Damage",
    OptionValue: "Minor Damage",
    DisplayOrder: 2,
  },
  {
    FieldKey: "foundation_cond",
    OptionLabel: "Major Damage",
    OptionValue: "Major Damage",
    DisplayOrder: 3,
  },
  {
    FieldKey: "foundation_cond",
    OptionLabel: "Not Visible",
    OptionValue: "Not Visible",
    DisplayOrder: 4,
  },
  {
    FieldKey: "foundation_cond",
    OptionLabel: "Not Installed",
    OptionValue: "Not Installed",
    DisplayOrder: 5,
  },

  // =====================================================
  // Pole Availability (pole_avail)
  // =====================================================

  {
    FieldKey: "pole_avail",
    OptionLabel: "Installed",
    OptionValue: "Yes",
    DisplayOrder: 1,
  },
  {
    FieldKey: "pole_avail",
    OptionLabel: "Not Installed",
    OptionValue: "No",
    DisplayOrder: 2,
  },

  // =====================================================
  // Pole SI (pole_si)
  // =====================================================

  {
    FieldKey: "pole_si",
    OptionLabel: "Technosys (LSY)",
    OptionValue: "Technosys (LSY)",
    DisplayOrder: 1,
  },
  {
    FieldKey: "pole_si",
    OptionLabel: "TCIL (LSY)",
    OptionValue: "TCIL (LSY)",
    DisplayOrder: 2,
  },
  {
    FieldKey: "pole_si",
    OptionLabel: "TCIL (RC)",
    OptionValue: "TCIL (RC)",
    DisplayOrder: 3,
  },
  {
    FieldKey: "pole_si",
    OptionLabel: "TCIL (Smart City)",
    OptionValue: "TCIL (Smart City)",
    DisplayOrder: 4,
  },
  {
    FieldKey: "pole_si",
    OptionLabel: "TASL (Technosys)",
    OptionValue: "TASL (Technosys)",
    DisplayOrder: 5,
  },

  // =====================================================
  // Pole Status (pole_status)
  // =====================================================

  {
    FieldKey: "pole_status",
    OptionLabel: "VMS Live",
    OptionValue: "VMS",
    DisplayOrder: 1,
  },
  {
    FieldKey: "pole_status",
    OptionLabel: "Local Live",
    OptionValue: "Local",
    DisplayOrder: 2,
  },
  {
    FieldKey: "pole_status",
    OptionLabel: "Non-Live",
    OptionValue: "Non-Live",
    DisplayOrder: 3,
  },
  {
    FieldKey: "pole_status",
    OptionLabel: "Not Verified",
    OptionValue: "Not Verified",
    DisplayOrder: 4,
  },
  {
    FieldKey: "pole_status",
    OptionLabel: "Stock",
    OptionValue: "In Stock",
    DisplayOrder: 5,
  },
  {
    FieldKey: "pole_status",
    OptionLabel: "Dismantled",
    OptionValue: "Dismantled",
    DisplayOrder: 6,
  },

  // =====================================================
  // Junction Box Status (jb_status)
  // =====================================================

  {
    FieldKey: "jb_status",
    OptionLabel: "Installed",
    OptionValue: "Installed",
    DisplayOrder: 1,
  },
  {
    FieldKey: "jb_status",
    OptionLabel: "Not Installed",
    OptionValue: "Not Installed",
    DisplayOrder: 2,
  },
  {
    FieldKey: "jb_status",
    OptionLabel: "Damage",
    OptionValue: "Damage",
    DisplayOrder: 3,
  },

  // =====================================================
  // Power Cable (power_cable)
  // =====================================================

  {
    FieldKey: "power_cable",
    OptionLabel: "Installed",
    OptionValue: "Yes",
    DisplayOrder: 1,
  },
  {
    FieldKey: "power_cable",
    OptionLabel: "Not Installed",
    OptionValue: "No",
    DisplayOrder: 2,
  },
  {
    FieldKey: "power_cable",
    OptionLabel: "Not Verified",
    OptionValue: "Not Verified",
    DisplayOrder: 3,
  },

  // =====================================================
  // Power Cable Status (cable_status)
  // =====================================================

  {
    FieldKey: "cable_status",
    OptionLabel: "Overhead",
    OptionValue: "Overhead",
    DisplayOrder: 1,
  },
  {
    FieldKey: "cable_status",
    OptionLabel: "Underground",
    OptionValue: "Underground",
    DisplayOrder: 2,
  },
  {
    FieldKey: "cable_status",
    OptionLabel: "On Ground",
    OptionValue: "On Ground",
    DisplayOrder: 3,
  },
  {
    FieldKey: "cable_status",
    OptionLabel: "Not Verified",
    OptionValue: "Not Verified",
    DisplayOrder: 4,
  },
  {
    FieldKey: "cable_status",
    OptionLabel: "Damage",
    OptionValue: "Damage",
    DisplayOrder: 5,
  },

  // =====================================================
  // Earthing Wire (earthing_wire)
  // =====================================================

  {
    FieldKey: "earthing_wire",
    OptionLabel: "Installed",
    OptionValue: "Installed",
    DisplayOrder: 1,
  },
  {
    FieldKey: "earthing_wire",
    OptionLabel: "Not Installed",
    OptionValue: "Not Installed",
    DisplayOrder: 2,
  },
  {
    FieldKey: "earthing_wire",
    OptionLabel: "Broken",
    OptionValue: "Broken",
    DisplayOrder: 3,
  },
  {
    FieldKey: "earthing_wire",
    OptionLabel: "Not Connected",
    OptionValue: "Not Connected",
    DisplayOrder: 4,
  },
  {
    FieldKey: "earthing_wire",
    OptionLabel: "Not Visible",
    OptionValue: "Not Visible",
    DisplayOrder: 5,
  },
  {
    FieldKey: "earthing_wire",
    OptionLabel: "Not Verified",
    OptionValue: "Not Verified",
    DisplayOrder: 6,
  },

  // =====================================================
  // Earthing Chamber (earthing_chamber)
  // =====================================================

  {
    FieldKey: "earthing_chamber",
    OptionLabel: "Installed",
    OptionValue: "Installed",
    DisplayOrder: 1,
  },
  {
    FieldKey: "earthing_chamber",
    OptionLabel: "Not Installed",
    OptionValue: "Not Installed",
    DisplayOrder: 2,
  },
  {
    FieldKey: "earthing_chamber",
    OptionLabel: "Damage",
    OptionValue: "Damage",
    DisplayOrder: 3,
  },
  {
    FieldKey: "earthing_chamber",
    OptionLabel: "Not Visible",
    OptionValue: "Not Visible",
    DisplayOrder: 4,
  },
  {
    FieldKey: "earthing_chamber",
    OptionLabel: "Not Verified",
    OptionValue: "Not Verified",
    DisplayOrder: 5,
  },

  // =====================================================
  // Earthing Cover (earthing_cover)
  // =====================================================

  {
    FieldKey: "earthing_cover",
    OptionLabel: "Installed",
    OptionValue: "Installed",
    DisplayOrder: 1,
  },
  {
    FieldKey: "earthing_cover",
    OptionLabel: "Not Installed",
    OptionValue: "Not Installed",
    DisplayOrder: 2,
  },
  {
    FieldKey: "earthing_cover",
    OptionLabel: "Damage",
    OptionValue: "Damage",
    DisplayOrder: 3,
  },
  {
    FieldKey: "earthing_cover",
    OptionLabel: "Not Visible",
    OptionValue: "Not Visible",
    DisplayOrder: 4,
  },
  {
    FieldKey: "earthing_cover",
    OptionLabel: "Not Verified",
    OptionValue: "Not Verified",
    DisplayOrder: 5,
  },

  // =====================================================
  // Meter Box Status (meter_box_status)
  // =====================================================

  {
    FieldKey: "meter_box_status",
    OptionLabel: "Installed",
    OptionValue: "Installed",
    DisplayOrder: 1,
  },
  {
    FieldKey: "meter_box_status",
    OptionLabel: "Not Installed",
    OptionValue: "Not Installed",
    DisplayOrder: 2,
  },
  {
    FieldKey: "meter_box_status",
    OptionLabel: "Damage",
    OptionValue: "Damage",
    DisplayOrder: 3,
  },

  // =====================================================
  // Meter Status (meter_status)
  // =====================================================

  {
    FieldKey: "meter_status",
    OptionLabel: "Installed",
    OptionValue: "Installed",
    DisplayOrder: 1,
  },
  {
    FieldKey: "meter_status",
    OptionLabel: "Not Installed",
    OptionValue: "Not Installed",
    DisplayOrder: 2,
  },

  // =====================================================
  // Meter Power Status (meter_power_status)
  // =====================================================

  {
    FieldKey: "meter_power_status",
    OptionLabel: "Powered",
    OptionValue: "Powered",
    DisplayOrder: 1,
  },
  {
    FieldKey: "meter_power_status",
    OptionLabel: "Non-Powered",
    OptionValue: "Non-Powered",
    DisplayOrder: 2,
  },
  {
    FieldKey: "meter_power_status",
    OptionLabel: "Tapping",
    OptionValue: "Tapping",
    DisplayOrder: 3,
  },

  // =====================================================
  // Connectivity Type (connectivity_type)
  // =====================================================

  {
    FieldKey: "connectivity_type",
    OptionLabel: "Fiber",
    OptionValue: "Fiber",
    DisplayOrder: 1,
  },
  {
    FieldKey: "connectivity_type",
    OptionLabel: "RF",
    OptionValue: "RF",
    DisplayOrder: 2,
  },
  {
    FieldKey: "connectivity_type",
    OptionLabel: "No Connectivity",
    OptionValue: "No Connectivity",
    DisplayOrder: 4,
  },

  // =====================================================
  // Count Options (camera_count, switch_count)
  // =====================================================

  {
    FieldKey: "camera_count",
    OptionLabel: "0",
    OptionValue: "0",
    DisplayOrder: 1,
  },
  {
    FieldKey: "camera_count",
    OptionLabel: "1",
    OptionValue: "1",
    DisplayOrder: 2,
  },
  {
    FieldKey: "camera_count",
    OptionLabel: "2",
    OptionValue: "2",
    DisplayOrder: 3,
  },
  {
    FieldKey: "camera_count",
    OptionLabel: "3",
    OptionValue: "3",
    DisplayOrder: 4,
  },
  {
    FieldKey: "camera_count",
    OptionLabel: "4",
    OptionValue: "4",
    DisplayOrder: 5,
  },
  {
    FieldKey: "camera_count",
    OptionLabel: "5",
    OptionValue: "5",
    DisplayOrder: 6,
  },

  {
    FieldKey: "switch_count",
    OptionLabel: "0",
    OptionValue: "0",
    DisplayOrder: 1,
  },
  {
    FieldKey: "switch_count",
    OptionLabel: "1",
    OptionValue: "1",
    DisplayOrder: 2,
  },
  {
    FieldKey: "switch_count",
    OptionLabel: "2",
    OptionValue: "2",
    DisplayOrder: 3,
  },
  {
    FieldKey: "switch_count",
    OptionLabel: "3",
    OptionValue: "3",
    DisplayOrder: 4,
  },
  {
    FieldKey: "switch_count",
    OptionLabel: "4",
    OptionValue: "4",
    DisplayOrder: 5,
  },
  {
    FieldKey: "switch_count",
    OptionLabel: "5",
    OptionValue: "5",
    DisplayOrder: 6,
  },
];
