module {
  // Nanoseconds since epoch (matches Time.now() / IC system time).
  public type Timestamp = Nat;

  // Identifier for a restaurant location (Bunbohue65 chain).
  public type RestaurantId = Text;

  // Stable identifier for an activated device (e.g. tablet/POS hardware id).
  public type DeviceId = Text;

  // Identifier for a partner (tenant) of the multi-partner platform. Each
  // partner owns its own restaurant chain and subdomain of toidatmon.com.
  public type TenantId = Text;
};
