<template>
  <div class="checkout-view">
    <div class="checkout-header">
      <h2 class="page-title">确认订单</h2>
      <el-button @click="router.push('/user/cart')">返回购物车</el-button>
    </div>

    <div v-if="!authStore.isAuthenticated" class="hint-card">
      <p>请先登录后再结算。</p>
    </div>

    <div v-else v-loading="loading" class="checkout-body">
      <div v-if="selectedItems.length === 0" class="empty-state">
        <p>没有选中的商品，请先在购物车中勾选要结算的商品。</p>
        <el-button type="primary" @click="router.push('/user/cart')">去购物车</el-button>
      </div>

      <template v-else>
        <div class="section card-block">
          <div class="section-title">商品清单</div>
          <div
            v-for="item in selectedItems"
            :key="item.id"
            class="line-item"
          >
            <span class="name">{{ item.product_name }}</span>
            <span class="meta">× {{ item.quantity }}</span>
            <span class="points">{{ item.quantity * item.points_required }} 积分</span>
          </div>
          <div class="total-row">
            <span>合计</span>
            <span class="total-points">{{ cartSummary.totalPoints }} 积分</span>
          </div>
          <div v-if="userPoints !== null" class="balance-row">
            <span>当前积分</span>
            <span :class="{ insufficient: userPoints < cartSummary.totalPoints }">
              {{ userPoints }}
            </span>
          </div>
        </div>

        <div class="section card-block">
          <div class="section-title">收货信息</div>
          <el-form label-width="88px">
            <el-form-item label="收货地址" required>
              <el-input
                v-model="shippingAddress"
                type="textarea"
                :rows="3"
                placeholder="请填写详细收货地址"
                maxlength="200"
                show-word-limit
              />
            </el-form-item>
            <el-form-item label="备注">
              <el-input
                v-model="remark"
                type="textarea"
                :rows="2"
                placeholder="选填"
                maxlength="200"
                show-word-limit
              />
            </el-form-item>
          </el-form>
        </div>

        <div class="actions">
          <el-button
            type="primary"
            size="large"
            :loading="submitLoading"
            :disabled="!canSubmit"
            @click="handleSubmit"
          >
            提交订单
          </el-button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import { apiUser } from '@/api';
import {
  cartSummary,
  loading,
  selectedItems,
  fetchCart
} from '@/stores/cart';

const router = useRouter();
const authStore = useAuthStore();

const shippingAddress = ref('');
const remark = ref('');
const userPoints = ref(null);
const submitLoading = ref(false);

const canSubmit = computed(() => {
  const enough =
    userPoints.value === null ||
    userPoints.value >= cartSummary.value.totalPoints;
  return (
    selectedItems.value.length > 0 &&
    shippingAddress.value.trim().length > 0 &&
    enough
  );
});

onMounted(async () => {
  if (!authStore.isAuthenticated) {
    ElMessage.warning('请先登录');
    router.push('/login');
    return;
  }
  await fetchCart();
  try {
    const res = await apiUser.getProfile();
    if (res.success && res.data) {
      userPoints.value = res.data.points ?? 0;
    }
  } catch {
    userPoints.value = null;
  }
  if (selectedItems.value.length === 0) {
    ElMessage.info('请先在购物车中选择要结算的商品');
  }
});

const handleSubmit = async () => {
  if (!shippingAddress.value.trim()) {
    ElMessage.warning('请填写收货地址');
    return;
  }
  if (userPoints.value !== null && userPoints.value < cartSummary.value.totalPoints) {
    ElMessage.error('积分不足，无法提交订单');
    return;
  }
  submitLoading.value = true;
  try {
    ElMessage.info('订单提交功能即将上线，当前为演示流程。');
  } finally {
    submitLoading.value = false;
  }
};
</script>

<style scoped>
.checkout-view {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.checkout-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: #303133;
}

.hint-card,
.empty-state {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  padding: 40px;
  text-align: center;
  color: #606266;
}

.checkout-body {
  min-height: 200px;
}

.card-block {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  padding: 20px;
  margin-bottom: 16px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 16px;
  color: #303133;
}

.line-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid #ebeef5;
  font-size: 14px;
}

.line-item:last-of-type {
  border-bottom: none;
}

.name {
  flex: 1;
  color: #303133;
}

.meta {
  color: #909399;
}

.points {
  width: 100px;
  text-align: right;
  color: #e6a23c;
  font-weight: 600;
}

.total-row,
.balance-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #ebeef5;
  font-size: 15px;
}

.total-points {
  font-size: 18px;
  font-weight: 600;
  color: #e6a23c;
}

.balance-row .insufficient {
  color: #f56c6c;
  font-weight: 600;
}

.actions {
  display: flex;
  justify-content: flex-end;
}
</style>
