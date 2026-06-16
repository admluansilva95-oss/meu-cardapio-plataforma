/**
 * Tipagens mínimas para WebUSB / Web Bluetooth (impressão térmica no painel).
 * Evita dependência `@types/w3c-web-usb` / `@types/web-bluetooth`.
 */

export {};

declare global {
  interface USBDeviceFilter {
    classCode?: number;
    vendorId?: number;
    productId?: number;
  }

  interface USBEndpoint {
    endpointNumber: number;
    direction: "in" | "out";
    type: "bulk" | "interrupt" | "isochronous";
  }

  interface USBAlternateInterface {
    endpoints: USBEndpoint[];
  }

  interface USBInterface {
    interfaceNumber: number;
    alternates: USBAlternateInterface[];
  }

  interface USBConfiguration {
    configurationValue: number;
    interfaces: USBInterface[];
  }

  interface USBOutTransferResult {
    status: "ok" | "stall" | "babble";
  }

  interface USBDevice {
    opened: boolean;
    configuration: USBConfiguration | null;
    configurations?: USBConfiguration[];
    open(): Promise<void>;
    close(): Promise<void>;
    selectConfiguration(configurationValue: number): Promise<void>;
    claimInterface(interfaceNumber: number): Promise<void>;
    releaseInterface(interfaceNumber: number): Promise<void>;
    transferOut(endpointNumber: number, data: BufferSource): Promise<USBOutTransferResult>;
  }

  interface USB {
    requestDevice(options?: { filters?: USBDeviceFilter[] }): Promise<USBDevice>;
  }

  interface BluetoothRemoteGATTCharacteristic {
    writeValue(buffer: BufferSource): Promise<void>;
    writeValueWithoutResponse?(buffer: BufferSource): Promise<void>;
  }

  interface BluetoothRemoteGATTService {
    getCharacteristic(name: string): Promise<BluetoothRemoteGATTCharacteristic>;
  }

  interface BluetoothRemoteGATTServer {
    connected: boolean;
    disconnect(): void;
    connect(): Promise<BluetoothRemoteGATTServer>;
    getPrimaryService(service: string): Promise<BluetoothRemoteGATTService>;
  }

  interface BluetoothDevice {
    gatt?: BluetoothRemoteGATTServer;
  }

  interface Bluetooth {
    requestDevice(options?: {
      optionalServices?: string[];
      acceptAllDevices?: boolean;
    }): Promise<BluetoothDevice>;
  }

  interface Navigator {
    usb?: USB;
    bluetooth?: Bluetooth;
  }
}
