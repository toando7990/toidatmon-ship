import Map "mo:core/Map";

// Stable upgrade: Restaurant thêm lat/lng — toạ độ nhà hàng, admin nhập tay
// (xem RestaurantManager.tsx). Dùng để gọi Lalamove "Get Quotation" (cần
// toạ độ 2 đầu: nhà hàng + địa chỉ nhận hàng khách) và tính nhà hàng gần
// nhất theo địa chỉ khách đã chọn (xem CreateOrder.tsx).
//
// Dữ liệu CŨ (mọi nhà hàng đang tồn tại) được migrate với lat=0.0/lng=0.0 —
// CHƯA CÓ toạ độ hợp lệ. Admin cần vào nhập tay toạ độ cho từng nhà hàng
// sau khi nâng cấp — frontend tự loại các nhà hàng lat=0.0/lng=0.0 khỏi
// phép tính khoảng cách/nhà hàng gần nhất cho tới khi admin nhập xong.
module {
  type OldRestaurant = {
    restaurantId : Text;
    name : Text;
    address : Text;
    phone : Text;
    visible : Bool;
  };
  type NewRestaurant = {
    restaurantId : Text;
    name : Text;
    address : Text;
    phone : Text;
    visible : Bool;
    lat : Float;
    lng : Float;
  };

  type OldActor = {
    restaurants : Map.Map<Text, OldRestaurant>;
  };
  type NewActor = {
    restaurants : Map.Map<Text, NewRestaurant>;
  };

  public func migration(old : OldActor) : NewActor {
    let restaurants : Map.Map<Text, NewRestaurant> = Map.empty();
    for ((id, r) in old.restaurants.toArray().vals()) {
      let newRestaurant : NewRestaurant = {
        restaurantId = r.restaurantId;
        name = r.name;
        address = r.address;
        phone = r.phone;
        visible = r.visible;
        lat = 0.0;
        lng = 0.0;
      };
      restaurants.add(id, newRestaurant);
    };
    { restaurants };
  };
};
