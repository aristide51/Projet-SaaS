export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      account_deletion_requests: {
        Row: {
          id: string;
          processed_at: string | null;
          requested_at: string;
          status: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          processed_at?: string | null;
          requested_at?: string;
          status?: string;
          user_id: string;
        };
        Update: {
          id?: string;
          processed_at?: string | null;
          requested_at?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          entity: string;
          entity_id: string | null;
          id: string;
          metadata: NonNullable<Json>;
          shop_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          entity: string;
          entity_id?: string | null;
          id?: string;
          metadata?: NonNullable<Json>;
          shop_id?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          entity?: string;
          entity_id?: string | null;
          id?: string;
          metadata?: NonNullable<Json>;
          shop_id?: string | null;
        };
        Relationships: [];
      };
      availability_rules: {
        Row: {
          end_time: string;
          id: string;
          resource_id: string;
          shop_id: string;
          start_time: string;
          weekday: number;
        };
        ComputedFields: never;
        Insert: {
          end_time: string;
          id?: string;
          resource_id: string;
          shop_id: string;
          start_time: string;
          weekday: number;
        };
        Update: {
          end_time?: string;
          id?: string;
          resource_id?: string;
          shop_id?: string;
          start_time?: string;
          weekday?: number;
        };
        Relationships: [
          {
            foreignKeyName: "availability_rules_resource_id_shop_id_fkey";
            columns: ["resource_id", "shop_id"];
            isOneToOne: false;
            referencedRelation: "resources";
            referencedColumns: ["id", "shop_id"];
          },
        ];
      };
      bookings: {
        Row: {
          cancelled_reason: string | null;
          created_at: string;
          customer_id: string;
          customer_name: string | null;
          customer_note: string | null;
          customer_phone: string | null;
          during: unknown;
          id: string;
          resource_id: string;
          service_id: string;
          shop_id: string;
          status: Database["public"]["Enums"]["booking_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          cancelled_reason?: string | null;
          created_at?: string;
          customer_id: string;
          customer_name?: string | null;
          customer_note?: string | null;
          customer_phone?: string | null;
          during: unknown;
          id?: string;
          resource_id: string;
          service_id: string;
          shop_id: string;
          status?: Database["public"]["Enums"]["booking_status"];
          updated_at?: string;
        };
        Update: {
          cancelled_reason?: string | null;
          created_at?: string;
          customer_id?: string;
          customer_name?: string | null;
          customer_note?: string | null;
          customer_phone?: string | null;
          during?: unknown;
          id?: string;
          resource_id?: string;
          service_id?: string;
          shop_id?: string;
          status?: Database["public"]["Enums"]["booking_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bookings_resource_id_shop_id_fkey";
            columns: ["resource_id", "shop_id"];
            isOneToOne: false;
            referencedRelation: "resources";
            referencedColumns: ["id", "shop_id"];
          },
          {
            foreignKeyName: "bookings_service_id_shop_id_fkey";
            columns: ["service_id", "shop_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id", "shop_id"];
          },
          {
            foreignKeyName: "bookings_shop_id_fkey";
            columns: ["shop_id"];
            isOneToOne: false;
            referencedRelation: "shops";
            referencedColumns: ["id"];
          },
        ];
      };
      cart_items: {
        Row: {
          cart_id: string;
          id: string;
          product_id: string;
          quantity: number;
          shop_id: string;
          variant_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          cart_id: string;
          id?: string;
          product_id: string;
          quantity: number;
          shop_id: string;
          variant_id?: string | null;
        };
        Update: {
          cart_id?: string;
          id?: string;
          product_id?: string;
          quantity?: number;
          shop_id?: string;
          variant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_shop_id_fkey";
            columns: ["cart_id", "shop_id"];
            isOneToOne: false;
            referencedRelation: "carts";
            referencedColumns: ["id", "shop_id"];
          },
          {
            foreignKeyName: "cart_items_product_id_shop_id_fkey";
            columns: ["product_id", "shop_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id", "shop_id"];
          },
          {
            foreignKeyName: "cart_items_variant_id_shop_id_fkey";
            columns: ["variant_id", "shop_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["id", "shop_id"];
          },
        ];
      };
      carts: {
        Row: {
          created_at: string;
          customer_id: string;
          id: string;
          shop_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          customer_id: string;
          id?: string;
          shop_id: string;
        };
        Update: {
          created_at?: string;
          customer_id?: string;
          id?: string;
          shop_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "carts_shop_id_fkey";
            columns: ["shop_id"];
            isOneToOne: false;
            referencedRelation: "shops";
            referencedColumns: ["id"];
          },
        ];
      };
      categories: {
        Row: {
          id: string;
          name: string;
          parent_id: string | null;
          position: number;
          shop_id: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          name: string;
          parent_id?: string | null;
          position?: number;
          shop_id: string;
        };
        Update: {
          id?: string;
          name?: string;
          parent_id?: string | null;
          position?: number;
          shop_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_shop_id_fkey";
            columns: ["parent_id", "shop_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id", "shop_id"];
          },
          {
            foreignKeyName: "categories_shop_id_fkey";
            columns: ["shop_id"];
            isOneToOne: false;
            referencedRelation: "shops";
            referencedColumns: ["id"];
          },
        ];
      };
      coupon_redemptions: {
        Row: {
          coupon_id: string;
          created_at: string;
          customer_id: string;
          id: string;
          order_id: string;
          shop_id: string;
        };
        ComputedFields: never;
        Insert: {
          coupon_id: string;
          created_at?: string;
          customer_id: string;
          id?: string;
          order_id: string;
          shop_id: string;
        };
        Update: {
          coupon_id?: string;
          created_at?: string;
          customer_id?: string;
          id?: string;
          order_id?: string;
          shop_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_shop_id_fkey";
            columns: ["coupon_id", "shop_id"];
            isOneToOne: false;
            referencedRelation: "coupons";
            referencedColumns: ["id", "shop_id"];
          },
          {
            foreignKeyName: "coupon_redemptions_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: true;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      coupons: {
        Row: {
          active: boolean;
          code: string;
          created_at: string;
          ends_at: string | null;
          id: string;
          max_uses: number | null;
          min_amount: number;
          per_customer_limit: number;
          scope: NonNullable<Json>;
          shop_id: string;
          starts_at: string | null;
          type: Database["public"]["Enums"]["coupon_type"];
          used_count: number;
          value: number;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          code: string;
          created_at?: string;
          ends_at?: string | null;
          id?: string;
          max_uses?: number | null;
          min_amount?: number;
          per_customer_limit?: number;
          scope?: NonNullable<Json>;
          shop_id: string;
          starts_at?: string | null;
          type: Database["public"]["Enums"]["coupon_type"];
          used_count?: number;
          value: number;
        };
        Update: {
          active?: boolean;
          code?: string;
          created_at?: string;
          ends_at?: string | null;
          id?: string;
          max_uses?: number | null;
          min_amount?: number;
          per_customer_limit?: number;
          scope?: NonNullable<Json>;
          shop_id?: string;
          starts_at?: string | null;
          type?: Database["public"]["Enums"]["coupon_type"];
          used_count?: number;
          value?: number;
        };
        Relationships: [
          {
            foreignKeyName: "coupons_shop_id_fkey";
            columns: ["shop_id"];
            isOneToOne: false;
            referencedRelation: "shops";
            referencedColumns: ["id"];
          },
        ];
      };
      invoices: {
        Row: {
          amount: number;
          created_at: string;
          due_at: string;
          id: string;
          paid_at: string | null;
          payment_ref: string | null;
          pdf_path: string | null;
          period_end: string;
          period_start: string;
          plan_id: string;
          shop_id: string;
          status: Database["public"]["Enums"]["invoice_status"];
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          created_at?: string;
          due_at: string;
          id?: string;
          paid_at?: string | null;
          payment_ref?: string | null;
          pdf_path?: string | null;
          period_end: string;
          period_start: string;
          plan_id: string;
          shop_id: string;
          status?: Database["public"]["Enums"]["invoice_status"];
        };
        Update: {
          amount?: number;
          created_at?: string;
          due_at?: string;
          id?: string;
          paid_at?: string | null;
          payment_ref?: string | null;
          pdf_path?: string | null;
          period_end?: string;
          period_start?: string;
          plan_id?: string;
          shop_id?: string;
          status?: Database["public"]["Enums"]["invoice_status"];
        };
        Relationships: [
          {
            foreignKeyName: "invoices_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoices_shop_id_fkey";
            columns: ["shop_id"];
            isOneToOne: false;
            referencedRelation: "shops";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          created_at: string;
          id: string;
          payload: NonNullable<Json>;
          read_at: string | null;
          type: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          payload?: NonNullable<Json>;
          read_at?: string | null;
          type: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          payload?: NonNullable<Json>;
          read_at?: string | null;
          type?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      order_items: {
        Row: {
          id: string;
          name_snapshot: string;
          order_id: string;
          product_id: string | null;
          quantity: number;
          shop_id: string;
          unit_price: number;
          variant_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          name_snapshot: string;
          order_id: string;
          product_id?: string | null;
          quantity: number;
          shop_id: string;
          unit_price: number;
          variant_id?: string | null;
        };
        Update: {
          id?: string;
          name_snapshot?: string;
          order_id?: string;
          product_id?: string | null;
          quantity?: number;
          shop_id?: string;
          unit_price?: number;
          variant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_shop_id_fkey";
            columns: ["order_id", "shop_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id", "shop_id"];
          },
          {
            foreignKeyName: "order_items_product_id_shop_id_fkey";
            columns: ["product_id", "shop_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id", "shop_id"];
          },
          {
            foreignKeyName: "order_items_variant_id_shop_id_fkey";
            columns: ["variant_id", "shop_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["id", "shop_id"];
          },
        ];
      };
      order_status_history: {
        Row: {
          actor_id: string | null;
          actor_type: Database["public"]["Enums"]["actor_type"];
          created_at: string;
          from_status: Database["public"]["Enums"]["order_status"] | null;
          id: string;
          note: string | null;
          order_id: string;
          reference: string | null;
          shop_id: string;
          to_status: Database["public"]["Enums"]["order_status"];
        };
        ComputedFields: never;
        Insert: {
          actor_id?: string | null;
          actor_type: Database["public"]["Enums"]["actor_type"];
          created_at?: string;
          from_status?: Database["public"]["Enums"]["order_status"] | null;
          id?: string;
          note?: string | null;
          order_id: string;
          reference?: string | null;
          shop_id: string;
          to_status: Database["public"]["Enums"]["order_status"];
        };
        Update: {
          actor_id?: string | null;
          actor_type?: Database["public"]["Enums"]["actor_type"];
          created_at?: string;
          from_status?: Database["public"]["Enums"]["order_status"] | null;
          id?: string;
          note?: string | null;
          order_id?: string;
          reference?: string | null;
          shop_id?: string;
          to_status?: Database["public"]["Enums"]["order_status"];
        };
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_shop_id_fkey";
            columns: ["order_id", "shop_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id", "shop_id"];
          },
        ];
      };
      orders: {
        Row: {
          cancelled_at: string | null;
          cancelled_reason: string | null;
          code: string;
          completed_at: string | null;
          coupon_id: string | null;
          created_at: string;
          customer_id: string;
          customer_name: string | null;
          customer_phone: string | null;
          delivery_address: string | null;
          discount: number;
          expires_at: string | null;
          fulfillment: Database["public"]["Enums"]["fulfillment_type"];
          id: string;
          note: string | null;
          paid_at: string | null;
          payment_method: Database["public"]["Enums"]["payment_method_type"];
          refund_reference: string | null;
          refunded_at: string | null;
          reject_count: number;
          shop_id: string;
          status: Database["public"]["Enums"]["order_status"];
          subtotal: number;
          total: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          cancelled_at?: string | null;
          cancelled_reason?: string | null;
          code?: string;
          completed_at?: string | null;
          coupon_id?: string | null;
          created_at?: string;
          customer_id: string;
          customer_name?: string | null;
          customer_phone?: string | null;
          delivery_address?: string | null;
          discount?: number;
          expires_at?: string | null;
          fulfillment?: Database["public"]["Enums"]["fulfillment_type"];
          id?: string;
          note?: string | null;
          paid_at?: string | null;
          payment_method: Database["public"]["Enums"]["payment_method_type"];
          refund_reference?: string | null;
          refunded_at?: string | null;
          reject_count?: number;
          shop_id: string;
          status?: Database["public"]["Enums"]["order_status"];
          subtotal: number;
          total: number;
          updated_at?: string;
        };
        Update: {
          cancelled_at?: string | null;
          cancelled_reason?: string | null;
          code?: string;
          completed_at?: string | null;
          coupon_id?: string | null;
          created_at?: string;
          customer_id?: string;
          customer_name?: string | null;
          customer_phone?: string | null;
          delivery_address?: string | null;
          discount?: number;
          expires_at?: string | null;
          fulfillment?: Database["public"]["Enums"]["fulfillment_type"];
          id?: string;
          note?: string | null;
          paid_at?: string | null;
          payment_method?: Database["public"]["Enums"]["payment_method_type"];
          refund_reference?: string | null;
          refunded_at?: string | null;
          reject_count?: number;
          shop_id?: string;
          status?: Database["public"]["Enums"]["order_status"];
          subtotal?: number;
          total?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_coupon_id_fkey";
            columns: ["coupon_id"];
            isOneToOne: false;
            referencedRelation: "coupons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_shop_id_fkey";
            columns: ["shop_id"];
            isOneToOne: false;
            referencedRelation: "shops";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_declarations: {
        Row: {
          created_at: string;
          id: string;
          order_id: string;
          payer_phone: string;
          reject_reason: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          screenshot_path: string | null;
          shop_id: string;
          status: Database["public"]["Enums"]["declaration_status"];
          transaction_ref: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          order_id: string;
          payer_phone: string;
          reject_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          screenshot_path?: string | null;
          shop_id: string;
          status?: Database["public"]["Enums"]["declaration_status"];
          transaction_ref: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          order_id?: string;
          payer_phone?: string;
          reject_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          screenshot_path?: string | null;
          shop_id?: string;
          status?: Database["public"]["Enums"]["declaration_status"];
          transaction_ref?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_declarations_order_id_shop_id_fkey";
            columns: ["order_id", "shop_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id", "shop_id"];
          },
        ];
      };
      payments: {
        Row: {
          amount: number;
          booking_id: string | null;
          created_at: string;
          id: string;
          idempotency_key: string;
          order_id: string | null;
          provider: string;
          provider_ref: string | null;
          raw_webhook: Json | null;
          shop_id: string;
          status: Database["public"]["Enums"]["payment_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          booking_id?: string | null;
          created_at?: string;
          id?: string;
          idempotency_key: string;
          order_id?: string | null;
          provider: string;
          provider_ref?: string | null;
          raw_webhook?: Json | null;
          shop_id: string;
          status?: Database["public"]["Enums"]["payment_status"];
          updated_at?: string;
        };
        Update: {
          amount?: number;
          booking_id?: string | null;
          created_at?: string;
          id?: string;
          idempotency_key?: string;
          order_id?: string | null;
          provider?: string;
          provider_ref?: string | null;
          raw_webhook?: Json | null;
          shop_id?: string;
          status?: Database["public"]["Enums"]["payment_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_shop_id_fkey";
            columns: ["booking_id", "shop_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id", "shop_id"];
          },
          {
            foreignKeyName: "payments_order_id_shop_id_fkey";
            columns: ["order_id", "shop_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id", "shop_id"];
          },
        ];
      };
      plans: {
        Row: {
          active: boolean;
          code: string;
          features: NonNullable<Json>;
          id: string;
          limits: NonNullable<Json>;
          name: string;
          price_monthly: number;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          code: string;
          features?: NonNullable<Json>;
          id?: string;
          limits?: NonNullable<Json>;
          name: string;
          price_monthly: number;
          sort_order?: number;
        };
        Update: {
          active?: boolean;
          code?: string;
          features?: NonNullable<Json>;
          id?: string;
          limits?: NonNullable<Json>;
          name?: string;
          price_monthly?: number;
          sort_order?: number;
        };
        Relationships: [];
      };
      product_images: {
        Row: {
          created_at: string;
          id: string;
          path: string;
          position: number;
          product_id: string;
          shop_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          path: string;
          position?: number;
          product_id: string;
          shop_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          path?: string;
          position?: number;
          product_id?: string;
          shop_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_shop_id_fkey";
            columns: ["product_id", "shop_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id", "shop_id"];
          },
        ];
      };
      product_variants: {
        Row: {
          id: string;
          name: string;
          price: number | null;
          product_id: string;
          shop_id: string;
          stock: number | null;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          name: string;
          price?: number | null;
          product_id: string;
          shop_id: string;
          stock?: number | null;
        };
        Update: {
          id?: string;
          name?: string;
          price?: number | null;
          product_id?: string;
          shop_id?: string;
          stock?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_shop_id_fkey";
            columns: ["product_id", "shop_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id", "shop_id"];
          },
        ];
      };
      products: {
        Row: {
          category_id: string | null;
          compare_at_price: number | null;
          compatibility: string | null;
          created_at: string;
          deleted_at: string | null;
          description: string | null;
          id: string;
          is_sample: boolean;
          name: string;
          price: number;
          search_vector: unknown;
          shop_id: string;
          sku: string | null;
          status: Database["public"]["Enums"]["product_status"];
          stock: number | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          category_id?: string | null;
          compare_at_price?: number | null;
          compatibility?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          id?: string;
          is_sample?: boolean;
          name: string;
          price: number;
          search_vector?: unknown;
          shop_id: string;
          sku?: string | null;
          status?: Database["public"]["Enums"]["product_status"];
          stock?: number | null;
          updated_at?: string;
        };
        Update: {
          category_id?: string | null;
          compare_at_price?: number | null;
          compatibility?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          id?: string;
          is_sample?: boolean;
          name?: string;
          price?: number;
          search_vector?: unknown;
          shop_id?: string;
          sku?: string | null;
          status?: Database["public"]["Enums"]["product_status"];
          stock?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_category_id_shop_id_fkey";
            columns: ["category_id", "shop_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id", "shop_id"];
          },
          {
            foreignKeyName: "products_shop_id_fkey";
            columns: ["shop_id"];
            isOneToOne: false;
            referencedRelation: "shops";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          full_name: string | null;
          id: string;
          phone: string | null;
          role_global: Database["public"]["Enums"]["app_role"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          full_name?: string | null;
          id: string;
          phone?: string | null;
          role_global?: Database["public"]["Enums"]["app_role"];
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          full_name?: string | null;
          id?: string;
          phone?: string | null;
          role_global?: Database["public"]["Enums"]["app_role"];
          updated_at?: string;
        };
        Relationships: [];
      };
      resources: {
        Row: {
          active: boolean;
          id: string;
          name: string;
          shop_id: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          id?: string;
          name: string;
          shop_id: string;
        };
        Update: {
          active?: boolean;
          id?: string;
          name?: string;
          shop_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "resources_shop_id_fkey";
            columns: ["shop_id"];
            isOneToOne: false;
            referencedRelation: "shops";
            referencedColumns: ["id"];
          },
        ];
      };
      reviews: {
        Row: {
          author_name: string | null;
          booking_id: string | null;
          comment: string | null;
          created_at: string;
          customer_id: string;
          id: string;
          order_id: string | null;
          photo_paths: string[];
          rating: number;
          shop_id: string;
          shop_replied_at: string | null;
          shop_reply: string | null;
          status: Database["public"]["Enums"]["review_status"];
        };
        ComputedFields: never;
        Insert: {
          author_name?: string | null;
          booking_id?: string | null;
          comment?: string | null;
          created_at?: string;
          customer_id: string;
          id?: string;
          order_id?: string | null;
          photo_paths?: string[];
          rating: number;
          shop_id: string;
          shop_replied_at?: string | null;
          shop_reply?: string | null;
          status?: Database["public"]["Enums"]["review_status"];
        };
        Update: {
          author_name?: string | null;
          booking_id?: string | null;
          comment?: string | null;
          created_at?: string;
          customer_id?: string;
          id?: string;
          order_id?: string | null;
          photo_paths?: string[];
          rating?: number;
          shop_id?: string;
          shop_replied_at?: string | null;
          shop_reply?: string | null;
          status?: Database["public"]["Enums"]["review_status"];
        };
        Relationships: [
          {
            foreignKeyName: "reviews_booking_id_shop_id_fkey";
            columns: ["booking_id", "shop_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id", "shop_id"];
          },
          {
            foreignKeyName: "reviews_order_id_shop_id_fkey";
            columns: ["order_id", "shop_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id", "shop_id"];
          },
        ];
      };
      services: {
        Row: {
          active: boolean;
          created_at: string;
          deleted_at: string | null;
          deposit_amount: number;
          description: string | null;
          duration_min: number;
          id: string;
          is_sample: boolean;
          name: string;
          price: number;
          shop_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          created_at?: string;
          deleted_at?: string | null;
          deposit_amount?: number;
          description?: string | null;
          duration_min: number;
          id?: string;
          is_sample?: boolean;
          name: string;
          price: number;
          shop_id: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          deleted_at?: string | null;
          deposit_amount?: number;
          description?: string | null;
          duration_min?: number;
          id?: string;
          is_sample?: boolean;
          name?: string;
          price?: number;
          shop_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "services_shop_id_fkey";
            columns: ["shop_id"];
            isOneToOne: false;
            referencedRelation: "shops";
            referencedColumns: ["id"];
          },
        ];
      };
      shop_members: {
        Row: {
          created_at: string;
          permissions: NonNullable<Json>;
          role: Database["public"]["Enums"]["shop_role"];
          shop_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          permissions?: NonNullable<Json>;
          role?: Database["public"]["Enums"]["shop_role"];
          shop_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          permissions?: NonNullable<Json>;
          role?: Database["public"]["Enums"]["shop_role"];
          shop_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shop_members_shop_id_fkey";
            columns: ["shop_id"];
            isOneToOne: false;
            referencedRelation: "shops";
            referencedColumns: ["id"];
          },
        ];
      };
      shop_onboarding: {
        Row: {
          current_step: number;
          draft: NonNullable<Json>;
          shop_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          current_step?: number;
          draft?: NonNullable<Json>;
          shop_id: string;
          updated_at?: string;
        };
        Update: {
          current_step?: number;
          draft?: NonNullable<Json>;
          shop_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shop_onboarding_shop_id_fkey";
            columns: ["shop_id"];
            isOneToOne: true;
            referencedRelation: "shops";
            referencedColumns: ["id"];
          },
        ];
      };
      shop_payment_accounts: {
        Row: {
          created_at: string;
          credentials_encrypted: string;
          provider: string;
          shop_id: string;
          status: string;
          updated_at: string;
          webhook_secret_encrypted: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          credentials_encrypted: string;
          provider: string;
          shop_id: string;
          status?: string;
          updated_at?: string;
          webhook_secret_encrypted?: string | null;
        };
        Update: {
          created_at?: string;
          credentials_encrypted?: string;
          provider?: string;
          shop_id?: string;
          status?: string;
          updated_at?: string;
          webhook_secret_encrypted?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "shop_payment_accounts_shop_id_fkey";
            columns: ["shop_id"];
            isOneToOne: true;
            referencedRelation: "shops";
            referencedColumns: ["id"];
          },
        ];
      };
      shop_payment_methods: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          phone_or_code: string | null;
          shop_id: string;
          type: Database["public"]["Enums"]["payment_method_type"];
          ussd_template: string | null;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: string;
          phone_or_code?: string | null;
          shop_id: string;
          type: Database["public"]["Enums"]["payment_method_type"];
          ussd_template?: string | null;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: string;
          phone_or_code?: string | null;
          shop_id?: string;
          type?: Database["public"]["Enums"]["payment_method_type"];
          ussd_template?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "shop_payment_methods_shop_id_fkey";
            columns: ["shop_id"];
            isOneToOne: false;
            referencedRelation: "shops";
            referencedColumns: ["id"];
          },
        ];
      };
      shop_settings: {
        Row: {
          booking_auto_confirm: boolean;
          booking_cancel_before_hours: number;
          booking_min_notice_hours: number;
          delivery_enabled: boolean;
          manual_payment_max_amount: number | null;
          order_expiry_manual_hours: number;
          order_expiry_online_minutes: number;
          pickup_enabled: boolean;
          shop_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          booking_auto_confirm?: boolean;
          booking_cancel_before_hours?: number;
          booking_min_notice_hours?: number;
          delivery_enabled?: boolean;
          manual_payment_max_amount?: number | null;
          order_expiry_manual_hours?: number;
          order_expiry_online_minutes?: number;
          pickup_enabled?: boolean;
          shop_id: string;
          updated_at?: string;
        };
        Update: {
          booking_auto_confirm?: boolean;
          booking_cancel_before_hours?: number;
          booking_min_notice_hours?: number;
          delivery_enabled?: boolean;
          manual_payment_max_amount?: number | null;
          order_expiry_manual_hours?: number;
          order_expiry_online_minutes?: number;
          pickup_enabled?: boolean;
          shop_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shop_settings_shop_id_fkey";
            columns: ["shop_id"];
            isOneToOne: true;
            referencedRelation: "shops";
            referencedColumns: ["id"];
          },
        ];
      };
      shops: {
        Row: {
          address: string | null;
          brand_color: string;
          category: Database["public"]["Enums"]["shop_category"];
          city: string;
          created_at: string;
          created_by: string;
          description: string | null;
          district: string | null;
          id: string;
          is_suspended: boolean;
          lat: number | null;
          lng: number | null;
          logo_path: string | null;
          name: string;
          opening_hours: NonNullable<Json>;
          phone: string | null;
          rating_avg: number;
          rating_count: number;
          rejection_reason: string | null;
          review_status: Database["public"]["Enums"]["shop_review_status"];
          reviewed_at: string | null;
          reviewed_by: string | null;
          slug: string;
          submitted_at: string | null;
          updated_at: string;
          whatsapp: string | null;
        };
        ComputedFields: never;
        Insert: {
          address?: string | null;
          brand_color?: string;
          category?: Database["public"]["Enums"]["shop_category"];
          city?: string;
          created_at?: string;
          created_by: string;
          description?: string | null;
          district?: string | null;
          id?: string;
          is_suspended?: boolean;
          lat?: number | null;
          lng?: number | null;
          logo_path?: string | null;
          name: string;
          opening_hours?: NonNullable<Json>;
          phone?: string | null;
          rating_avg?: number;
          rating_count?: number;
          rejection_reason?: string | null;
          review_status?: Database["public"]["Enums"]["shop_review_status"];
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          slug: string;
          submitted_at?: string | null;
          updated_at?: string;
          whatsapp?: string | null;
        };
        Update: {
          address?: string | null;
          brand_color?: string;
          category?: Database["public"]["Enums"]["shop_category"];
          city?: string;
          created_at?: string;
          created_by?: string;
          description?: string | null;
          district?: string | null;
          id?: string;
          is_suspended?: boolean;
          lat?: number | null;
          lng?: number | null;
          logo_path?: string | null;
          name?: string;
          opening_hours?: NonNullable<Json>;
          phone?: string | null;
          rating_avg?: number;
          rating_count?: number;
          rejection_reason?: string | null;
          review_status?: Database["public"]["Enums"]["shop_review_status"];
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          slug?: string;
          submitted_at?: string | null;
          updated_at?: string;
          whatsapp?: string | null;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          created_at: string;
          current_period_end: string | null;
          grace_until: string | null;
          plan_id: string;
          shop_id: string;
          status: Database["public"]["Enums"]["sub_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          current_period_end?: string | null;
          grace_until?: string | null;
          plan_id: string;
          shop_id: string;
          status?: Database["public"]["Enums"]["sub_status"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          current_period_end?: string | null;
          grace_until?: string | null;
          plan_id?: string;
          shop_id?: string;
          status?: Database["public"]["Enums"]["sub_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscriptions_shop_id_fkey";
            columns: ["shop_id"];
            isOneToOne: true;
            referencedRelation: "shops";
            referencedColumns: ["id"];
          },
        ];
      };
      time_off: {
        Row: {
          ends_at: string;
          id: string;
          reason: string | null;
          resource_id: string | null;
          shop_id: string;
          starts_at: string;
        };
        ComputedFields: never;
        Insert: {
          ends_at: string;
          id?: string;
          reason?: string | null;
          resource_id?: string | null;
          shop_id: string;
          starts_at: string;
        };
        Update: {
          ends_at?: string;
          id?: string;
          reason?: string | null;
          resource_id?: string | null;
          shop_id?: string;
          starts_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "time_off_resource_id_shop_id_fkey";
            columns: ["resource_id", "shop_id"];
            isOneToOne: false;
            referencedRelation: "resources";
            referencedColumns: ["id", "shop_id"];
          },
          {
            foreignKeyName: "time_off_shop_id_fkey";
            columns: ["shop_id"];
            isOneToOne: false;
            referencedRelation: "shops";
            referencedColumns: ["id"];
          },
        ];
      };
      webhook_events: {
        Row: {
          event_id: string;
          id: string;
          payload: NonNullable<Json>;
          processed_at: string | null;
          provider: string;
          received_at: string;
        };
        ComputedFields: never;
        Insert: {
          event_id: string;
          id?: string;
          payload: NonNullable<Json>;
          processed_at?: string | null;
          provider: string;
          received_at?: string;
        };
        Update: {
          event_id?: string;
          id?: string;
          payload?: NonNullable<Json>;
          processed_at?: string | null;
          provider?: string;
          received_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      book_slot: {
        Args: {
          p_note?: string;
          p_resource_id: string;
          p_service_id: string;
          p_start: string;
        };
        Returns: string;
      };
      catalog_product_limit: { Args: { p_shop: string }; Returns: number };
      catalog_trash_product_ids: {
        Args: { p_shop: string };
        Returns: string[];
      };
      catalog_trash_service_ids: {
        Args: { p_shop: string };
        Returns: string[];
      };
      create_order_from_cart: {
        Args: {
          p_cart_id: string;
          p_coupon_code?: string;
          p_delivery_address?: string;
          p_fulfillment?: Database["public"]["Enums"]["fulfillment_type"];
          p_note?: string;
          p_payment_method: Database["public"]["Enums"]["payment_method_type"];
        };
        Returns: string;
      };
      declare_payment: {
        Args: {
          p_order_id: string;
          p_payer_phone: string;
          p_screenshot_path?: string;
          p_transaction_ref: string;
        };
        Returns: string;
      };
      delete_catalog_variant: {
        Args: { p_product: string; p_shop: string; p_variant_id: string };
        Returns: undefined;
      };
      expire_pending_orders: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      moderate_review: {
        Args: {
          p_review_id: string;
          p_status: Database["public"]["Enums"]["review_status"];
        };
        Returns: undefined;
      };
      reply_to_review: {
        Args: { p_reply: string; p_review_id: string };
        Returns: undefined;
      };
      review_shop: {
        Args: { p_approve: boolean; p_reason?: string; p_shop: string };
        Returns: undefined;
      };
      save_catalog_product: {
        Args: { p_product: Json; p_shop: string };
        Returns: string;
      };
      save_catalog_service: {
        Args: { p_service: Json; p_shop: string };
        Returns: string;
      };
      save_catalog_variant: {
        Args: {
          p_name: string;
          p_price: number;
          p_product: string;
          p_shop: string;
          p_stock: number;
          p_variant_id: string;
        };
        Returns: string;
      };
      search_catalog_products: {
        Args: { p_query: string; p_shop: string };
        Returns: string[];
      };
      set_booking_status: {
        Args: {
          p_booking_id: string;
          p_reason?: string;
          p_to: Database["public"]["Enums"]["booking_status"];
        };
        Returns: undefined;
      };
      set_catalog_item_deleted: {
        Args: {
          p_deleted: boolean;
          p_item_id: string;
          p_kind: string;
          p_shop: string;
        };
        Returns: undefined;
      };
      set_shop_suspended: {
        Args: { p_reason?: string; p_shop: string; p_suspended: boolean };
        Returns: undefined;
      };
      submit_shop_for_review: { Args: { p_shop: string }; Returns: undefined };
      transition_order: {
        Args: {
          p_note?: string;
          p_order_id: string;
          p_reference?: string;
          p_to: Database["public"]["Enums"]["order_status"];
        };
        Returns: undefined;
      };
    };
    Enums: {
      actor_type: "customer" | "merchant" | "admin" | "system";
      app_role: "customer" | "admin";
      booking_status:
        "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
      coupon_type: "percent" | "fixed";
      declaration_status: "declared" | "confirmed" | "rejected";
      fulfillment_type: "pickup" | "delivery";
      invoice_status: "open" | "paid" | "void";
      order_status:
        | "pending_payment"
        | "payment_declared"
        | "paid"
        | "confirmed"
        | "ready"
        | "completed"
        | "cancelled"
        | "refunded";
      payment_method_type:
        | "ussd_orange"
        | "ussd_moov"
        | "ussd_coris"
        | "cash_on_delivery"
        | "pay_at_pickup"
        | "aggregator";
      payment_status:
        | "initiated"
        | "pending"
        | "succeeded"
        | "failed"
        | "expired"
        | "refunded";
      product_status: "available" | "out_of_stock" | "hidden";
      review_status: "published" | "hidden" | "flagged";
      shop_category: "hardware" | "auto_parts" | "garage" | "salon" | "other";
      shop_review_status: "draft" | "submitted" | "approved" | "rejected";
      shop_role: "owner" | "staff";
      sub_status: "active" | "past_due" | "expired";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      actor_type: ["customer", "merchant", "admin", "system"],
      app_role: ["customer", "admin"],
      booking_status: [
        "pending",
        "confirmed",
        "cancelled",
        "completed",
        "no_show",
      ],
      coupon_type: ["percent", "fixed"],
      declaration_status: ["declared", "confirmed", "rejected"],
      fulfillment_type: ["pickup", "delivery"],
      invoice_status: ["open", "paid", "void"],
      order_status: [
        "pending_payment",
        "payment_declared",
        "paid",
        "confirmed",
        "ready",
        "completed",
        "cancelled",
        "refunded",
      ],
      payment_method_type: [
        "ussd_orange",
        "ussd_moov",
        "ussd_coris",
        "cash_on_delivery",
        "pay_at_pickup",
        "aggregator",
      ],
      payment_status: [
        "initiated",
        "pending",
        "succeeded",
        "failed",
        "expired",
        "refunded",
      ],
      product_status: ["available", "out_of_stock", "hidden"],
      review_status: ["published", "hidden", "flagged"],
      shop_category: ["hardware", "auto_parts", "garage", "salon", "other"],
      shop_review_status: ["draft", "submitted", "approved", "rejected"],
      shop_role: ["owner", "staff"],
      sub_status: ["active", "past_due", "expired"],
    },
  },
} as const;
