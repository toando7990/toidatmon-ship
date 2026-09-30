// Coverage cho CustomerForm — tập trung vào việc tách cusTaxCode khỏi
// điều kiện hideAddress (BUG THẬT phát hiện lúc tái cấu trúc: trước đây
// hideAddress=true ẩn LUÔN cả cusTaxCode dù không liên quan gì tới địa
// chỉ giao hàng, và validate cũng bỏ qua nhầm mã số thuế).

import {
  CustomerForm,
  type CustomerFormValues,
  validateCustomerForm,
} from "@/components/CustomerForm";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const EMPTY_VALUES: CustomerFormValues = {
  cusName: "",
  cusPhone: "",
  cusAddress: "",
  cusTaxCode: "",
  receiverEmail: "",
};

describe("CustomerForm — tách cusTaxCode khỏi hideAddress", () => {
  afterEach(() => {
    cleanup();
  });

  it("still shows the tax code field even when hideAddress=true", () => {
    render(
      <CustomerForm
        values={EMPTY_VALUES}
        errors={{}}
        onChange={vi.fn()}
        hideAddress
      />,
    );

    expect(
      screen.getByTestId("customer_form.cus_tax_code_input"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("customer_form.cus_address_input"),
    ).not.toBeInTheDocument();
  });

  it("validates the tax code even when hideAddress=true (BUG THẬT đã sửa)", () => {
    const errors = validateCustomerForm(
      {
        ...EMPTY_VALUES,
        cusName: "Nguyễn Văn A",
        cusPhone: "0912345678",
        receiverEmail: "a@test.com",
        cusTaxCode: "123", // sai định dạng — phải bị bắt lỗi
      },
      { hideAddress: true },
    );

    expect(errors.cusTaxCode).toBeDefined();
    // KHÔNG được báo thiếu địa chỉ khi hideAddress=true.
    expect(errors.cusAddress).toBeUndefined();
  });

  it("does not require the address when hideAddress=true", () => {
    const errors = validateCustomerForm(
      {
        ...EMPTY_VALUES,
        cusName: "Nguyễn Văn A",
        cusPhone: "0912345678",
        receiverEmail: "a@test.com",
      },
      { hideAddress: true },
    );

    expect(errors.cusAddress).toBeUndefined();
  });

  it("shows both address and tax code fields when hideAddress is not set", () => {
    render(
      <CustomerForm values={EMPTY_VALUES} errors={{}} onChange={vi.fn()} />,
    );

    expect(
      screen.getByTestId("customer_form.cus_address_input"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("customer_form.cus_tax_code_input"),
    ).toBeInTheDocument();
  });
});
