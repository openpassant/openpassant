// SPDX-License-Identifier: Apache-2.0
// Generated from schemas/battery-passport.schema.json by json-schema-to-typescript.
// Do not edit by hand; run: pnpm --filter @openpassant/schema generate

/**
 * Non-negative percentage as a decimal string.
 */
export type PercentString = string;

/**
 * Content of one LMT battery passport version under Regulation (EU) 2023/1542, Annex XIII. Adopted by the project owner on 2026-09-23 (M0 sign-off). Every top-level property carries an x-section tag naming its Annex XIII content section (crypto spec section 2). Sources and encoding decisions: docs/research/annex-xiii-field-list.md.
 */
export interface BatteryPassport {
  /**
   * Battery category and identification (Annex VI Part A points 1-2 via Annex XIII 1(a); guidance DP 2, 6, 7). The passport's unique identifier (DP 1) is the envelope id, not repeated here.
   */
  identification: {
    /**
     * MVP scope is LMT batteries (Art. 3(1)(24)).
     */
    batteryCategory: 'lmt';
    /**
     * Model identification (Art. 38(6)).
     */
    modelId: string;
    /**
     * Batch or serial number, or product number (Art. 38(6)).
     */
    serialNumber: string;
    productNumber?: string;
    /**
     * Identifiers of the passports of the original battery or batteries, when this battery was prepared for re-use, repurposed or remanufactured (Art. 77(7)).
     */
    predecessorPassportIds?: string[];
    /**
     * Identity of the economic operator responsible for the passport (Art. 77(3)-(4); guidance DP 2).
     */
    responsibleOperator: {
      name: string;
      contact?: string;
    };
  };
  /**
   * Manufacturer identity (Annex VI Part A point 1, Art. 38(7); guidance DP 3-5).
   */
  manufacturer: {
    /**
     * Name, registered trade name or trade mark.
     */
    name: string;
    /**
     * Postal address with a single contact point.
     */
    postalAddress: string;
    website?: string;
    email?: string;
  };
  /**
   * Place and date of manufacture (Annex VI Part A points 3-4; guidance DP 8-9).
   */
  manufacturing: {
    /**
     * Geographical location of the manufacturing plant.
     */
    place: string;
    /**
     * Month and year of manufacture, YYYY-MM.
     */
    date: string;
  };
  /**
   * Weight, capacity, chemistry, extinguishing agent (Annex VI Part A points 5-7 and 9; guidance DP 10-12, 14; DP 25 rated capacity is a declared duplicate and modelled once here).
   */
  characteristics: {
    /**
     * Weight in grams.
     */
    weightG: number;
    /**
     * Rated capacity in milliampere-hours (Annex XIII 1(g)).
     */
    ratedCapacityMah: number;
    /**
     * Free text pending a controlled vocabulary (guidance defers format).
     */
    chemistry: string;
    /**
     * Usable extinguishing agent.
     */
    extinguishingAgent: string;
  };
  /**
   * Hazardous substances present other than mercury, cadmium or lead (Annex VI Part A point 8, Annex XIII 1(b); guidance DP 13). Empty array when none.
   */
  hazardousSubstances: {
    name: string;
    /**
     * CAS registry number, if identified.
     */
    casNumber?: string;
  }[];
  /**
   * Critical raw materials present above 0,1 % w/w (Annex VI Part A point 10; guidance DP 15). Empty array when none.
   */
  criticalRawMaterials: string[];
  /**
   * Carbon footprint information (Annex XIII 1(c), Art. 7(1)-(2)). OPTIONAL for LMT until 18 Aug 2028 (declaration) / 18 Feb 2030 (class); formats pending implementing acts (guidance DP 17-18).
   */
  carbonFootprint?: {
    /**
     * kg CO2e per kWh of total lifetime energy (Art. 7(1)).
     */
    totalKgCo2ePerKwh: string;
    /**
     * Carbon footprint performance class (Art. 7(2)).
     */
    performanceClass?: string;
    declarationNumber?: string;
    /**
     * Web link to the public carbon footprint study (Art. 7(1)(g)).
     */
    studyUrl?: string;
  };
  dueDiligenceReport?: DocumentRef;
  /**
   * Recovered-material shares in active materials / the battery (Annex XIII 1(e), Art. 8(1); guidance DP 20-23). OPTIONAL for LMT until 18 Aug 2033.
   */
  recycledContent?: {
    recoveredCobaltPct: PercentString;
    recoveredLithiumPct: PercentString;
    recoveredNickelPct: PercentString;
    recoveredLeadPct: PercentString;
  };
  /**
   * Non-negative percentage as a decimal string.
   */
  renewableContentSharePct: string;
  /**
   * Voltages and power (Annex XIII 1(h)-(i); guidance DP 26-30). Millivolts and watts as integers.
   */
  electrical: {
    voltageMinMv: number;
    voltageNominalMv: number;
    voltageMaxMv: number;
    voltageTemperatureRangeC?: TemperatureRangeC;
    /**
     * Original power capability in watts.
     */
    powerCapabilityW: number;
    /**
     * Power capability limits, free text pending a defined format.
     */
    powerLimits?: string;
    powerTemperatureRangeC?: TemperatureRangeC1;
  };
  /**
   * Rated performance and endurance of the model (Annex XIII 1(j), 1(l), 1(n)-(p); guidance DP 31-32, 34, 36-39).
   */
  performance: {
    expectedLifetimeCycles: number;
    lifetimeReferenceTest: string;
    initialRoundTripEfficiencyPct: PercentString;
    /**
     * Non-negative percentage as a decimal string.
     */
    roundTripEfficiencyAtHalfCycleLifePct: string;
    /**
     * Internal battery cell and pack resistance in milliohms (Annex XIII 1(o)).
     */
    internalResistance: {
      cellMohm: number;
      packMohm: number;
    };
    /**
     * C-rate of the relevant cycle-life test.
     */
    cycleLifeTestCRate: string;
    storageTemperatureRangeC: TemperatureRangeC2;
    storageTemperatureReferenceTest: string;
  };
  /**
   * Commercial warranty for the calendar life (Annex XIII 1(m)). OPTIONAL: only where a warranty is envisaged (guidance DP 35).
   */
  warranty?: {
    calendarLifeMonths: number;
  };
  /**
   * Marking requirements of Art. 13(4)-(5) (Annex XIII 1(q); guidance DP 40-41).
   */
  markings: {
    /**
     * separate_collection is always required; cadmium/lead only above the Art. 13(5) thresholds.
     *
     * @minItems 1
     */
    symbols: [
      'separate_collection' | 'cadmium' | 'lead',
      ...('separate_collection' | 'cadmium' | 'lead')[],
    ];
    labelImage?: DocumentRef1;
  };
  euDeclarationOfConformity: DocumentRef2;
  /**
   * Waste prevention and management information, Art. 74(1)(a)-(f) (Annex XIII 1(s); guidance DP 43). Each member is text or a URL.
   */
  wasteManagement: {
    /**
     * End-user role in waste prevention (74(1)(a)).
     */
    preventionRole: string;
    /**
     * End-user role in separate collection (74(1)(b)).
     */
    separateCollectionRole: string;
    /**
     * Separate collection, take-back and collection points (74(1)(c)).
     */
    collectionPoints: string;
    /**
     * Safety instructions for waste batteries, including lithium risks (74(1)(d)).
     */
    safetyInstructions: string;
    /**
     * Meaning of labels and symbols (74(1)(e)).
     */
    labelMeanings: string;
    /**
     * Impact of substances on environment and health (74(1)(f)).
     */
    substanceImpacts: string;
  };
  /**
   * Detailed composition, including cathode, anode and electrolyte materials (Annex XIII 2(a); guidance DP 45).
   */
  detailedComposition: {
    /**
     * @minItems 1
     */
    cathodeMaterials: [string, ...string[]];
    /**
     * @minItems 1
     */
    anodeMaterials: [string, ...string[]];
    /**
     * @minItems 1
     */
    electrolyteMaterials: [string, ...string[]];
  };
  /**
   * Part numbers for components and sources for replacement spares (Annex XIII 2(b); guidance DP 46-47).
   */
  spareParts: {
    components: {
      component: string;
      partNumber: string;
    }[];
    suppliers: {
      name: string;
      contact: string;
    }[];
  };
  /**
   * Dismantling information (Annex XIII 2(c); guidance DP 48).
   */
  dismantling: {
    /**
     * Exploded diagrams showing the location of battery cells.
     *
     * @minItems 1
     */
    explodedDiagrams: [DocumentRef1, ...DocumentRef1[]];
    /**
     * @minItems 1
     */
    disassemblySequences: [string, ...string[]];
    /**
     * Type and number of fastening techniques to be unlocked.
     */
    fasteners: {
      type: string;
      count: number;
    }[];
    /**
     * Tools required for disassembly.
     */
    tools: string[];
    /**
     * Warnings where risk of damaging parts exists. Empty array when none.
     */
    warnings: string[];
    cellCount: number;
    cellLayout: string;
  };
  /**
   * Safety measures (Annex XIII 2(d); guidance DP 49).
   */
  safetyMeasures: {
    instructions: string;
    documents?: DocumentRef1[];
  };
  /**
   * Results of test reports proving compliance (Annex XIII point 3; guidance DP 50).
   *
   * @minItems 1
   */
  testReports: [
    {
      /**
       * Which requirement the report proves compliance with.
       */
      subject: string;
      report: DocumentRef1;
      issuedBy?: string;
      date?: string;
    },
    ...{
      /**
       * Which requirement the report proves compliance with.
       */
      subject: string;
      report: DocumentRef1;
      issuedBy?: string;
      date?: string;
    }[],
  ];
  /**
   * Values of the Art. 10(1) / Annex IV Part A parameters for this individual battery, at placing on the market and on status changes (Annex XIII 4(a); guidance DP 51-60). Round-trip values where applicable.
   */
  performanceValues: {
    /**
     * Dynamic per-unit rated capacity (guidance DP 51).
     */
    ratedCapacityMah?: number;
    capacityFadePct: PercentString;
    powerW: number;
    powerFadePct: PercentString;
    internalResistanceMohm: number;
    internalResistanceIncreasePct: PercentString;
    roundTripEfficiencyPct?: PercentString;
    roundTripEfficiencyFadePct?: PercentString;
    expectedLifetimeCycles: number;
    expectedLifetimeCalendarYears: number;
  };
  /**
   * State of health per Art. 14 with the LMT parameter set of Annex VII Part A (Annex XIII 4(b); guidance DP 62-66). SOCE is EV-only and deliberately absent.
   */
  stateOfHealth: {
    remainingCapacityMah: number;
    /**
     * Where possible.
     */
    remainingPowerCapabilityW?: number;
    /**
     * Non-negative percentage as a decimal string.
     */
    remainingRoundTripEfficiencyPct?: string;
    /**
     * Evolution of self-discharging rates.
     */
    selfDischargeRates?: {
      recordedAt: string;
      ratePctPerMonth: PercentString;
    }[];
    /**
     * Where possible.
     */
    ohmicResistanceMohm?: number;
  };
  /**
   * Battery status (Annex XIII 4(c); guidance DP 67). The regulation's exact terms, including the hyphenated 're-used'.
   */
  status: 'original' | 'repurposed' | 're-used' | 'remanufactured' | 'waste';
  /**
   * Information and data resulting from use (Annex XIII 4(d); guidance DP 68-71, all 'if applicable'). OPTIONAL as a whole.
   */
  usageData?: {
    chargeDischargeCycles?: number;
    /**
     * Negative events, such as accidents.
     */
    negativeEvents?: {
      date: string;
      description: string;
    }[];
    /**
     * Periodically recorded operating environmental conditions and state of charge.
     */
    environmentalRecords?: {
      recordedAt: string;
      temperatureC: number;
      stateOfChargePct: PercentString;
    }[];
  };
}
/**
 * Responsible sourcing information per the Art. 52(3) due-diligence report (Annex XIII 1(d)). OPTIONAL: obligations apply from 18 Aug 2027 (Reg. 2025/1561) and Art. 47 exempts operators below EUR 40m turnover (guidance DP 19).
 */
export interface DocumentRef {
  title: string;
  url: string;
  mimeType?: string;
  /**
   * Lowercase hex SHA-256 of the document, for tamper evidence.
   */
  sha256?: string;
}
/**
 * Temperature range for the voltage figures, when relevant.
 */
export interface TemperatureRangeC {
  minC: number;
  maxC: number;
}
/**
 * Temperature range for the power figures, when relevant.
 */
export interface TemperatureRangeC1 {
  minC: number;
  maxC: number;
}
/**
 * Temperature range the battery can withstand when not in use (Annex XIII 1(l)).
 */
export interface TemperatureRangeC2 {
  minC: number;
  maxC: number;
}
export interface DocumentRef1 {
  title: string;
  url: string;
  mimeType?: string;
  /**
   * Lowercase hex SHA-256 of the document, for tamper evidence.
   */
  sha256?: string;
}
/**
 * The EU declaration of conformity (Annex XIII 1(r), Art. 18; guidance DP 42).
 */
export interface DocumentRef2 {
  title: string;
  url: string;
  mimeType?: string;
  /**
   * Lowercase hex SHA-256 of the document, for tamper evidence.
   */
  sha256?: string;
}
