// Coverage cho NearestRestaurantDisplay — hiện đúng theo trạng thái
// loading/no-result/có kết quả, và hiện đúng phí ship + thời gian giao
// dự kiến thật (Phần 4/6 — Lalamove "Get Quotation").

import { NearestRestaurantDisplay } from "@/components/NearestRestaurantDisplay";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

const BASE_PROPS = {
  restaurantName: "Bún Bò Huế 65 - Láng",
  restaurantAddress: "69 đường Láng, Hà Nội",
  isLoading: false,
  hasNoResult: false,
  shippingFee: null,
  estimatedDeliveryMinutes: null,
  isQuoteLoading: false,
  isFavorite: false,
  nearestIsDifferentFromFavorite: false,
};

describe("NearestRestaurantDisplay", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows a loading skeleton while loading the nearest restaurant itself", () => {
    render(
      <NearestRestaurantDisplay
        {...BASE_PROPS}
        restaurantName={null}
        restaurantAddress={null}
        isLoading
      />,
    );
    expect(
      screen.getByTestId("nearest_restaurant.loading_state"),
    ).toBeInTheDocument();
  });

  it("shows the no-result state when there is no nearest restaurant", () => {
    render(
      <NearestRestaurantDisplay
        {...BASE_PROPS}
        restaurantName={null}
        restaurantAddress={null}
        hasNoResult
      />,
    );
    expect(
      screen.getByTestId("nearest_restaurant.no_result_state"),
    ).toBeInTheDocument();
  });

  it("shows the nearest restaurant's name and address", () => {
    render(<NearestRestaurantDisplay {...BASE_PROPS} />);
    expect(screen.getByTestId("nearest_restaurant.name")).toHaveTextContent(
      "Bún Bò Huế 65 - Láng",
    );
    expect(screen.getByText("69 đường Láng, Hà Nội")).toBeInTheDocument();
  });

  it("shows the 'đang tính' message while the shipping quote is loading", () => {
    render(<NearestRestaurantDisplay {...BASE_PROPS} isQuoteLoading />);
    expect(
      screen.getByTestId("nearest_restaurant.delivery_time"),
    ).toHaveTextContent("Đang tính thời gian giao hàng dự kiến");
    expect(
      screen.queryByTestId("nearest_restaurant.shipping_fee"),
    ).not.toBeInTheDocument();
  });

  it("shows the real estimated delivery time and shipping fee once the quote resolves", () => {
    render(
      <NearestRestaurantDisplay
        {...BASE_PROPS}
        shippingFee={28000}
        estimatedDeliveryMinutes={24}
      />,
    );
    expect(
      screen.getByTestId("nearest_restaurant.delivery_time"),
    ).toHaveTextContent("Dự kiến giao trong ~24 phút");
    expect(
      screen.getByTestId("nearest_restaurant.shipping_fee"),
    ).toHaveTextContent("28.000đ");
  });

  it("shows 'chưa xác định' when the quote resolved but has no usable delivery time", () => {
    render(
      <NearestRestaurantDisplay
        {...BASE_PROPS}
        shippingFee={0}
        estimatedDeliveryMinutes={0}
      />,
    );
    expect(
      screen.getByTestId("nearest_restaurant.delivery_time"),
    ).toHaveTextContent("Chưa xác định được thời gian giao hàng");
  });
});
