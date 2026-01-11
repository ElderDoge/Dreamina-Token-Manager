<template>
  <div class="w-100vw h-100vh p-4 overflow-y-auto">
    <div class="container mx-auto">
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 px-4 space-y-4 md:space-y-0 pt-5">
        <h1 class="text-4xl font-bold">Dreamina Token Manager <span class="text-gray-500 text-sm"></span></h1>
        <div class="flex flex-col sm:flex-row w-full md:w-auto space-y-3 sm:space-y-0 sm:space-x-2 lg:space-x-4">
          <button @click="showAddModal = true"
                  class="action-button font-bold border border-green-200 bg-green-50 text-green-900 px-4 py-2 rounded-xl shadow-sm hover:bg-green-100 hover:border-green-400 transition-all duration-300 transform hover:-translate-y-1 active:translate-y-0">
            添加账号
          </button>
          <button @click="refreshAllAccounts"
                  :disabled="isRefreshingAll"
                  :class="[
                    'action-button font-bold px-4 py-2 rounded-xl shadow-sm transition-all duration-300 transform active:translate-y-0',
                    isRefreshingAll
                      ? 'bg-purple-400 text-white border-purple-400 refreshing-button-purple cursor-not-allowed transform-none'
                      : 'macaron-purple-button text-purple-800 hover:-translate-y-1'
                  ]">
            <span v-if="isRefreshingAll" class="flex items-center space-x-2">
              <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>刷新中...</span>
            </span>
            <span v-else>一键刷新</span>
          </button>
          <button @click="forceRefreshAllAccounts"
                  :disabled="isForceRefreshingAll"
                  :class="[
                    'action-button font-bold px-4 py-2 rounded-xl shadow-sm transition-all duration-300 transform active:translate-y-0',
                    isForceRefreshingAll
                      ? 'bg-pink-400 text-white border-pink-400 refreshing-button-pink cursor-not-allowed transform-none'
                      : 'macaron-pink-button text-pink-800 hover:-translate-y-1'
                  ]">
            <span v-if="isForceRefreshingAll" class="flex items-center space-x-2">
              <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>强制刷新中...</span>
            </span>
            <span v-else>强制刷新</span>
          </button>
          <button @click="exportAccounts"
                  class="action-button font-bold border border-yellow-200 bg-yellow-50 text-yellow-900 px-4 py-2 rounded-xl shadow-sm hover:bg-yellow-100 hover:border-yellow-400 transition-all duration-300 transform hover:-translate-y-1 active:translate-y-0">
            导出账号
          </button>
          <div class="flex items-center space-x-2 w-full sm:w-auto">
            <input v-model="proxyTarget" placeholder="透传目标，例如 https://jimeng.985100.xyz" class="flex-1 sm:w-72 rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            <button @click="saveProxyTarget"
                    class="action-button font-bold border border-blue-200 bg-blue-50 text-blue-900 px-3 py-2 rounded-xl shadow-sm hover:bg-blue-100 hover:border-blue-400 transition-all duration-300">
              保存目标
            </button>
          </div>
        </div>
      </div>

      <!-- 分页与视图控制区 -->
      <div class="flex justify-between items-center px-4 mb-4">
        <div class="flex items-center space-x-4">
          <div class="flex items-center space-x-2">
            <span class="text-gray-700">每页显示:</span>
            <select v-model="pageSize" @change="changePageSize" class="rounded-lg border-gray-300 bg-white/50 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 transition-all duration-300">
              <option v-for="opt in pageSizeOptions" :key="opt" :value="opt">{{ opt }}</option>
            </select>
          </div>
          <!-- 视图切换 -->
          <div class="flex items-center p-1 bg-gray-200/80 rounded-lg">
            <button @click="switchViewMode('list')"
                    :class="['px-3 py-1 rounded-md text-sm font-medium transition-colors duration-200', viewMode === 'list' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-800']"
                    title="列表视图">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd" />
              </svg>
            </button>
            <button @click="switchViewMode('card')"
                    :class="['px-3 py-1 rounded-md text-sm font-medium transition-colors duration-200', viewMode === 'card' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-800']"
                    title="卡片视图">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2h-2zM11 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2h-2z" />
              </svg>
            </button>
          </div>
        </div>
        <div class="flex space-x-2 items-center">
          <span class="text-gray-700">共 {{ totalItems }} 项</span>
          <button 
            @click="changePage(currentPage - 1)" 
            :disabled="currentPage === 1" 
            :class="[
              'px-3 py-1 rounded-lg transition-all duration-300', 
              currentPage === 1 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
            ]"
          >
            上一页
          </button>
          <span class="text-gray-700">{{ currentPage }}/{{ totalPages }}</span>
          <button 
            @click="changePage(currentPage + 1)" 
            :disabled="currentPage === totalPages || totalPages === 0" 
            :class="[
              'px-3 py-1 rounded-lg transition-all duration-300', 
              currentPage === totalPages || totalPages === 0 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
            ]"
          >
            下一页
          </button>
        </div>
      </div>

      <!-- 多选操作区 -->
      <div class="flex justify-between items-center px-4 mb-4">
        <div class="flex items-center space-x-3">
          <label class="inline-flex items-center cursor-pointer group">
            <div class="relative">
              <input type="checkbox" 
                    v-model="selectAll" 
                    @change="toggleSelectAll" 
                    class="sr-only peer">
              <div class="w-6 h-6 bg-white border-2 border-gray-300 rounded-lg peer-checked:bg-indigo-500 peer-checked:border-indigo-500 transition-all duration-300 flex items-center justify-center">
                <svg v-show="selectAll" class="w-4 h-4 text-white" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
            </div>
            <span class="ml-2 text-gray-700 group-hover:text-indigo-700 transition-colors duration-200">全选</span>
          </label>
          <button 
            @click="deleteSelected" 
            :disabled="selectedTokens.length === 0" 
            :class="[
              'px-4 py-1.5 rounded-lg transition-all duration-300 border flex items-center space-x-1', 
              selectedTokens.length === 0 ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
            ]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
            </svg>
            <span>删除选中 ({{ selectedTokens.length }})</span>
          </button>
        </div>
        <button 
          @click="showDeleteAllConfirm = true" 
          class="px-4 py-1.5 rounded-lg border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 transition-all duration-300 flex items-center space-x-1"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
          </svg>
          <span>删除全部账号</span>
        </button>
      </div>

      <!-- Token列表 -->
      <div class="max-h-[calc(75vh)] overflow-y-auto pr-2 scrollbar-hidden">
        <!-- 卡片视图 -->
        <div v-if="viewMode === 'card'" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-4">
          <div v-for="token in displayedTokens" 
               :key="token.email" 
               class="token-card group relative overflow-hidden rounded-2xl transition-all duration-300 hover:shadow-2xl pt-4"
               :class="{'ring-2 ring-indigo-500 ring-opacity-75': isSelected(token.email)}">
            <div class="absolute top-3 left-3 z-10">
              <label class="custom-checkbox cursor-pointer">
                <input type="checkbox"
                       :checked="isSelected(token.email)"
                       @change="toggleSelect(token.email)"
                       class="sr-only peer">
                <div class="checkbox-icon w-6 h-6 bg-white/70 backdrop-blur-sm border-2 border-gray-300 rounded-lg peer-checked:bg-indigo-500 peer-checked:border-indigo-500 transition-all duration-300 flex items-center justify-center shadow-sm hover:shadow">
                  <svg v-show="isSelected(token.email)" class="w-4 h-4 text-white transform scale-0 peer-checked:scale-100 transition-transform duration-300" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
              </label>
            </div>
            <!-- 状态指示灯 -->
            <div class="absolute top-3 right-3 z-10 flex items-center space-x-2">
              <span class="w-3 h-3 rounded-full"
                    :class="{
                      'bg-green-500': !token.daily_unavailable_date,
                      'bg-yellow-500': token.daily_unavailable_date
                    }"
                    :title="token.daily_unavailable_date ? '当日不可用' : '当日可用'"></span>
              <span class="w-3 h-3 rounded-full"
                    :class="{
                      'bg-green-500': !token.overall_unavailable,
                      'bg-red-500': token.overall_unavailable
                    }"
                    :title="token.overall_unavailable ? '整体不可用' : '状态正常'"></span>
            </div>
            <div class="absolute inset-0 bg-white/30 backdrop-blur-md border border-white/30"></div>
            <div class="relative p-6 flex flex-col gap-4">
              <div class="flex flex-col space-y-3">
                <div class="relative flex items-center bg-blue-50/80 rounded-lg px-2 py-1">
                  <div class="overflow-x-auto scrollbar-hide flex-1 flex items-center space-x-2">
                    <span class="text-gray-700 min-w-[96px] text-left font-semibold">📧 Email:</span>
                    <span class="font-medium whitespace-nowrap text-left">{{ token.email }}</span>
                  </div>
                  <button @click="copyToClipboard(token.email)" class="absolute right-2 opacity-0 hover:opacity-100 transition-opacity bg-blue-200 hover:bg-blue-300 rounded px-2 py-1 text-base">📋</button>
                </div>
                <div class="relative flex items-center bg-blue-50/80 rounded-lg px-2 py-1">
                  <div class="overflow-x-auto scrollbar-hide flex-1 flex items-center space-x-2">
                    <span class="text-gray-700 min-w-[96px] text-left font-semibold">⏰ Expire:</span>
                    <span class="font-medium whitespace-nowrap text-left">{{ new Date(token.sessionid_expires * 1000).toLocaleString() }}</span>
                  </div>
                  <button @click="copyToClipboard(new Date(token.sessionid_expires * 1000).toLocaleString())" class="absolute right-2 opacity-0 hover:opacity-100 transition-opacity bg-blue-200 hover:bg-blue-300 rounded px-2 py-1 text-base">📋</button>
                </div>
                <!-- 权重显示 -->
                <div class="relative flex items-center bg-blue-50/80 rounded-lg px-2 py-1">
                  <div class="overflow-x-auto scrollbar-hide flex-1 flex items-center space-x-2">
                    <span class="text-gray-700 min-w-[96px] text-left font-semibold">⚖️ Weight:</span>
                    <div class="flex-1 flex items-center space-x-2">
                      <div class="flex-1 bg-gray-200 rounded-full h-2">
                        <div class="h-2 rounded-full transition-all duration-300"
                             :class="{
                               'bg-green-500': (token.weight ?? 100) >= 70,
                               'bg-yellow-500': (token.weight ?? 100) >= 30 && (token.weight ?? 100) < 70,
                               'bg-red-500': (token.weight ?? 100) < 30
                             }"
                             :style="{ width: (token.weight ?? 100) + '%' }"></div>
                      </div>
                      <span class="font-medium text-sm">{{ token.weight ?? 100 }}</span>
                    </div>
                  </div>
                </div>
                <!-- 当日调用统计 -->
                <div class="relative flex items-center bg-blue-50/80 rounded-lg px-2 py-1">
                  <div class="overflow-x-auto scrollbar-hide flex-1 flex items-center space-x-2">
                    <span class="text-gray-700 min-w-[96px] text-left font-semibold">📊 Today:</span>
                    <span class="font-medium whitespace-nowrap text-left">{{ token.daily_call_success || 0 }}/{{ token.daily_call_total || 0 }}</span>
                  </div>
                </div>
              </div>
              
              <div class="pt-4 mt-auto border-t border-gray-200/50 space-y-2">
                <button @click="refreshToken(token.email)"
                        :disabled="refreshingTokens.includes(token.email)"
                        :class="[
                          'w-full py-2 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2',
                          refreshingTokens.includes(token.email)
                            ? 'bg-green-400 text-white refreshing-button-green cursor-not-allowed'
                            : 'macaron-green-button text-green-600 hover:bg-green-100 border border-green-200'
                        ]">
                  <span v-if="refreshingTokens.includes(token.email)" class="flex items-center space-x-2">
                    <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                      <path class="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>刷新中...</span>
                  </span>
                  <span v-else>刷新令牌</span>
                </button>
                <button @click="deleteToken(token.email)"
                        class="w-full group-hover:bg-red-50 text-red-600 py-2 rounded-lg transition-all duration-300 hover:bg-red-100">
                  删除账号
                </button>
                <!-- 恢复按钮（整体不可用时显示） -->
                <button v-if="token.overall_unavailable"
                        @click="restoreAccount(token.email)"
                        class="w-full bg-orange-50 text-orange-600 py-2 rounded-lg transition-all duration-300 hover:bg-orange-100 border border-orange-200">
                  恢复可用性
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 列表视图 -->
        <div v-if="viewMode === 'list'" class="overflow-x-auto mx-4">
          <div class="bg-white/50 rounded-xl shadow-sm border border-gray-200/80 min-w-[700px]">
          <!-- 表头 -->
          <div class="grid grid-cols-[40px,1fr,180px,80px,100px,100px] gap-x-2 px-4 py-3 border-b border-gray-200/80 bg-gray-50/80 rounded-t-xl text-sm font-semibold text-gray-600">
            <div class="flex items-center justify-center">
              <input type="checkbox" v-model="selectAll" @change="toggleSelectAll" class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500">
            </div>
            <div>Email</div>
            <div>过期时间</div>
            <div class="text-center">权重</div>
            <div class="text-center">今日调用</div>
            <div class="text-center">操作</div>
          </div>
          <!-- 数据行 -->
          <div v-for="token in displayedTokens" :key="token.email"
               class="grid grid-cols-[40px,1fr,180px,80px,100px,100px] gap-x-2 px-4 py-2.5 items-center border-b border-gray-100 last:border-b-0 hover:bg-gray-50/50"
               :class="{'bg-indigo-50/50': isSelected(token.email)}">
            <!-- 复选框 -->
            <div class="flex items-center justify-center">
              <input type="checkbox" :checked="isSelected(token.email)" @change="toggleSelect(token.email)" class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500">
            </div>
            <!-- Email + 状态 -->
            <div class="flex items-center space-x-2 min-w-0">
              <span class="w-2 h-2 rounded-full flex-shrink-0" :class="{'bg-green-500': !token.daily_unavailable_date, 'bg-yellow-500': token.daily_unavailable_date}"></span>
              <span class="w-2 h-2 rounded-full flex-shrink-0" :class="{'bg-green-500': !token.overall_unavailable, 'bg-red-500': token.overall_unavailable}"></span>
              <span class="truncate text-gray-800 text-sm" :title="token.email">{{ token.email }}</span>
            </div>
            <!-- 过期时间 -->
            <div class="text-sm text-gray-600">{{ new Date(token.sessionid_expires * 1000).toLocaleString() }}</div>
            <!-- 权重 -->
            <div class="text-center text-sm font-medium"
                 :class="{'text-green-600': (token.weight ?? 100) >= 70, 'text-yellow-600': (token.weight ?? 100) >= 30 && (token.weight ?? 100) < 70, 'text-red-600': (token.weight ?? 100) < 30}">
              {{ token.weight ?? 100 }}
            </div>
            <!-- 今日调用 -->
            <div class="text-center text-sm text-gray-600">{{ token.daily_call_success || 0 }}/{{ token.daily_call_total || 0 }}</div>
            <!-- 操作 -->
            <div class="flex items-center justify-center space-x-1">
              <button @click="refreshToken(token.email)" :disabled="refreshingTokens.includes(token.email)" class="p-1.5 rounded hover:bg-green-100 text-gray-400 hover:text-green-600 transition-colors" title="刷新令牌">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" :class="{'animate-spin': refreshingTokens.includes(token.email)}" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 110 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd" /></svg>
              </button>
              <button @click="deleteToken(token.email)" class="p-1.5 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors" title="删除账号">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>
              </button>
              <button v-if="token.overall_unavailable" @click="restoreAccount(token.email)" class="p-1.5 rounded hover:bg-orange-100 text-gray-400 hover:text-orange-600 transition-colors" title="恢复可用性">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clip-rule="evenodd" /></svg>
              </button>
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 删除全部确认对话框 -->
    <div v-if="showDeleteAllConfirm" 
         class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
         @click.self="showDeleteAllConfirm = false">
      <div class="relative bg-white/90 backdrop-blur-lg rounded-2xl p-6 w-11/12 max-w-md transform transition-all duration-300 scale-100 opacity-100">
        <h2 class="text-2xl font-bold text-red-600 mb-4">⚠️ 危险操作</h2>
        <p class="text-gray-700 mb-6">您确定要删除<span class="font-bold">全部 {{ totalItems }} 个</span>账号吗？此操作不可恢复！</p>
        <div class="flex justify-end space-x-4">
          <button @click="showDeleteAllConfirm = false" 
                  class="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 transition-all duration-300">
            取消
          </button>
          <button @click="deleteAllAccounts" 
                  class="px-4 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700 transition-all duration-300">
            确认删除
          </button>
        </div>
      </div>
    </div>

    <!-- 添加账号模态框 -->
    <div v-if="showAddModal" 
         class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
         @click.self="showAddModal = false">
      <div class="relative bg-white/80 backdrop-blur-lg rounded-2xl p-6 w-11/12 max-w-md transform transition-all duration-300 scale-100 opacity-100">
        <div class="flex mb-6 border-b border-gray-200">
          <button :class="['flex-1 py-2 font-bold transition-all rounded-t-xl duration-300', addMode==='single' ? 'text-gray-600 border-b-2 border-gray-500 bg-gray-50/60' : 'text-gray-500 bg-transparent']" @click="addMode='single'">单账号添加</button>
          <button :class="['flex-1 py-2 font-bold transition-all rounded-t-xl duration-300', addMode==='batch' ? 'text-gray-600 border-b-2 border-gray-500 bg-gray-50/60' : 'text-gray-500 bg-transparent']" @click="addMode='batch'">批量添加</button>
        </div>
        <transition name="fade" mode="out-in">
          <div v-if="addMode==='single'" key="single">
            <h2 class="text-xl font-bold mb-4">添加账号</h2>
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700">Email</label>
                <input v-model="newAccount.email" type="email" 
                       class="mt-1 block w-full rounded-xl border-gray-300 bg-white/50 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 transition-all duration-300 h-12 text-base px-4">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Password</label>
                <input v-model="newAccount.password" type="password"
                       class="mt-1 block w-full rounded-xl border-gray-300 bg-white/50 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 transition-all duration-300 h-12 text-base px-4">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">SessionID (可选)</label>
                <input v-model="newAccount.sessionid" type="text" placeholder="如果提供则跳过登录"
                       class="mt-1 block w-full rounded-xl border-gray-300 bg-white/50 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 transition-all duration-300 h-12 text-base px-4">
              </div>
              <div class="flex justify-end space-x-4 pt-4">
                <button @click="showAddModal = false" 
                        class="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 transition-all duration-300">
                  取消
                </button>
                <button @click="addToken" 
                        class="px-4 py-2 rounded-xl bg-black text-white hover:bg-white hover:text-black transition-all duration-300">
                  添加
                </button>
              </div>
            </div>
          </div>
          <div v-else key="batch">
            <h2 class="text-xl font-bold mb-4 px-4">批量添加账号</h2>
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 px-4 pb-2">账号列表（每行一个，格式：email:password[:sessionid]）</label>
                <textarea v-model="batchAccounts" rows="6" class="mt-1 block w-full rounded-xl border-gray-300 bg-white/50 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 transition-all duration-300 h-36 text-base px-4 py-3 resize-none"></textarea>
              </div>
              <div class="flex justify-end space-x-4 pt-4">
                <button @click="showAddModal = false" 
                        class="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 transition-all duration-300">
                  取消
                </button>
                <button @click="addBatchTokens" 
                        class="px-4 py-2 rounded-xl bg-black text-white hover:bg-white hover:text-black transition-all duration-300">
                  批量添加
                </button>
              </div>
            </div>
          </div>
        </transition>
      </div>
    </div>

    <!-- Toast 通知 -->
    <div v-if="toast.show"
         :class="[
           'fixed bottom-4 right-4 z-50 px-6 py-4 rounded-xl shadow-lg transform transition-all duration-300',
           toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
         ]">
      <div class="flex items-center space-x-2">
        <svg v-if="toast.type === 'success'" class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
        </svg>
        <svg v-else class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
        </svg>
        <span>{{ toast.message }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import axios from 'axios'

// 视图模式
const viewMode = ref('list')

const tokens = ref([])
const showAddModal = ref(false)
const addMode = ref('single')
const newAccount = ref({
  email: '',
  password: '',
  sessionid: ''
})
const batchAccounts = ref('')

// 分页相关
const allTokens = ref([])
const serverTotal = ref(0)
const currentPage = ref(1)
const pageSize = ref(100)  // 列表视图默认100
const totalItems = computed(() => serverTotal.value)
const totalPages = computed(() => Math.max(1, Math.ceil(totalItems.value / pageSize.value)))

// 分页选项根据视图模式动态调整
const pageSizeOptions = computed(() => {
  return viewMode.value === 'list' ? [20, 50, 100, 200, 500] : [10, 20, 50, 100]
})

// 切换视图模式时重置分页
const switchViewMode = (mode) => {
  if (viewMode.value === mode) return
  viewMode.value = mode
  // 设置对应视图的默认分页
  const defaultSize = mode === 'list' ? 100 : 50
  if (pageSize.value !== defaultSize) {
    pageSize.value = defaultSize
    currentPage.value = 1
    selectedTokens.value = []
    selectAll.value = false
    getTokens(1, defaultSize)
  }
}

// 多选相关
const selectedTokens = ref([])
const selectAll = ref(false)
const showDeleteAllConfirm = ref(false)

// 刷新相关
const isRefreshingAll = ref(false)
const isForceRefreshingAll = ref(false)
const refreshingTokens = ref([])
// 透传目标
const proxyTarget = ref('')

// Toast 通知
const toast = ref({
  show: false,
  message: '',
  type: 'success'
})
let eventSource = null

const isSelected = (email) => {
  return selectedTokens.value.includes(email)
}

const toggleSelect = (email) => {
  const index = selectedTokens.value.indexOf(email)
  if (index === -1) {
    selectedTokens.value.push(email)
  } else {
    selectedTokens.value.splice(index, 1)
  }
  // 更新全选状态
  selectAll.value = selectedTokens.value.length === displayedTokens.value.length
}

const toggleSelectAll = () => {
  if (selectAll.value) {
    // 全选当前页
    selectedTokens.value = displayedTokens.value.map(token => token.email)
  } else {
    // 取消全选
    selectedTokens.value = []
  }
}

const deleteSelected = async () => {
  if (selectedTokens.value.length === 0) return
  
  if (!confirm(`确定要删除选中的 ${selectedTokens.value.length} 个账号吗？`)) return
  
  try {
    // 批量删除，这里假设后端支持批量删除，如果不支持，需要循环调用单个删除
    const deletePromises = selectedTokens.value.map(email => 
      axios.delete('/api/dreamina/deleteAccount', {
        data: { email },
        headers: {
          'Authorization': localStorage.getItem('apiKey') || ''
        }
      })
    )
    
    await Promise.all(deletePromises)
    await getTokens()
    selectedTokens.value = []
    selectAll.value = false
    showToast('删除成功')
  } catch (error) {
    console.error('批量删除失败:', error)
    showToast('批量删除失败: ' + error.message, 'error')
  }
}

const deleteAllAccounts = async () => {
  try {
    // 分页获取所有账号后删除
    let page = 1
    const batchSize = 100
    let hasMore = true
    let deletedCount = 0

    while (hasMore) {
      const res = await axios.get('/api/dreamina/getAllAccounts', {
        params: { page, pageSize: batchSize },
        headers: { 'Authorization': localStorage.getItem('apiKey') || '' }
      })

      const accounts = res.data.data || []
      if (accounts.length === 0) {
        hasMore = false
        break
      }

      const deletePromises = accounts.map(token =>
        axios.delete('/api/dreamina/deleteAccount', {
          data: { email: token.email },
          headers: { 'Authorization': localStorage.getItem('apiKey') || '' }
        })
      )
      await Promise.all(deletePromises)
      deletedCount += accounts.length

      if (accounts.length < batchSize) {
        hasMore = false
      }
    }

    showDeleteAllConfirm.value = false
    await getTokens()
    selectedTokens.value = []
    selectAll.value = false
    showToast(`已删除 ${deletedCount} 个账号`)
  } catch (error) {
    console.error('删除所有账号失败:', error)
    showToast('删除所有账号失败: ' + error.message, 'error')
  }
}

// 当前页显示的tokens（服务端分页，直接返回后端数据）
const displayedTokens = computed(() => allTokens.value)

const changePage = (page) => {
  if (page >= 1 && page <= totalPages.value) {
    currentPage.value = page
    // 重置选择状态
    selectedTokens.value = []
    selectAll.value = false
    getTokens(page, pageSize.value)
  }
}

const changePageSize = () => {
  currentPage.value = 1
  // 重置选择状态
  selectedTokens.value = []
  selectAll.value = false
  getTokens(1, pageSize.value)
}

const showToast = (message, type = 'success') => {
  toast.value.message = message
  toast.value.type = type
  toast.value.show = true

  setTimeout(() => {
    toast.value.show = false
  }, 3000)
}

const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    showToast('已复制到剪贴板')
  } catch (err) {
    console.error('复制失败:', err)
    showToast('复制失败', 'error')
  }
}

const getTokens = async (page = currentPage.value, size = pageSize.value) => {
  try {
    const fullRes = await axios.get('/api/dreamina/getAllAccounts', {
      params: {
        page,
        pageSize: size
      },
      headers: {
        'Authorization': localStorage.getItem('apiKey') || ''
      }
    })

    allTokens.value = fullRes.data.data
    serverTotal.value = fullRes.data.total ?? 0

    // 如果当前页超出了总页数，重置到第一页并重新获取
    if (currentPage.value > totalPages.value && totalPages.value > 0) {
      currentPage.value = 1
      return getTokens(1, size)
    }

    // 重置选择状态
    selectedTokens.value = []
    selectAll.value = false

  } catch (error) {
    console.error('获取Token列表失败:', error)
    showToast('获取Token列表失败: ' + error.message, 'error')
  }
}

const addToken = async () => {
  try {
    await axios.post('/api/dreamina/setAccount', newAccount.value, {
      headers: {
        'Authorization': localStorage.getItem('apiKey') || ''
      }
    })
    showAddModal.value = false
    newAccount.value = { email: '', password: '', sessionid: '' }
    showToast('添加任务已提交')
  } catch (error) {
    console.error('添加账号失败:', error)
    showToast('添加账号失败: ' + error.message, 'error')
  }
}

const addBatchTokens = async () => {
  try {
    await axios.post('/api/dreamina/setAccounts', { accounts: batchAccounts.value }, {
      headers: {
        'Authorization': localStorage.getItem('apiKey') || ''
      }
    })
    showAddModal.value = false
    batchAccounts.value = ''
    await getTokens()
    showToast('批量添加任务已提交')
  } catch (error) {
    console.error('批量添加失败:', error)
    showToast('批量添加失败: ' + error.message, 'error')
  }
}

const refreshToken = async (email) => {
  if (refreshingTokens.value.includes(email)) return

  refreshingTokens.value.push(email)

  try {
    await axios.post('/api/dreamina/refreshAccount', { email }, {
      headers: {
        'Authorization': localStorage.getItem('apiKey') || ''
      }
    })

    // 刷新成功后重新获取账号列表
    await getTokens()
    showToast(`账号 ${email} 令牌刷新成功`)
  } catch (error) {
    console.error('刷新账号令牌失败:', error)
    showToast('刷新账号令牌失败: ' + error.message, 'error')
  } finally {
    // 移除刷新状态
    const index = refreshingTokens.value.indexOf(email)
    if (index > -1) {
      refreshingTokens.value.splice(index, 1)
    }
  }
}

const refreshAllAccounts = async () => {
  if (isRefreshingAll.value) return

  if (!confirm('确定要刷新所有账号的令牌吗？这可能需要一些时间。')) return

  isRefreshingAll.value = true

  try {
    const response = await axios.post('/api/dreamina/refreshAllAccounts', {
      thresholdHours: 24
    }, {
      headers: {
        'Authorization': localStorage.getItem('apiKey') || ''
      }
    })

    // 刷新成功后重新获取账号列表
    await getTokens()
    showToast(`批量刷新完成，成功刷新了 ${response.data.refreshedCount} 个账号`)
  } catch (error) {
    console.error('批量刷新失败:', error)
    showToast('批量刷新失败: ' + error.message, 'error')
  } finally {
    isRefreshingAll.value = false
  }
}

const forceRefreshAllAccounts = async () => {
  if (isForceRefreshingAll.value) return

  if (!confirm('确定要强制刷新所有账号的令牌吗？这将刷新所有账号，不管它们是否即将过期，可能需要较长时间。')) return

  isForceRefreshingAll.value = true

  try {
    const response = await axios.post('/api/dreamina/forceRefreshAllAccounts', {}, {
      headers: {
        'Authorization': localStorage.getItem('apiKey') || ''
      }
    })

    // 刷新成功后重新获取账号列表
    await getTokens()
    showToast(`强制刷新完成，成功刷新了 ${response.data.refreshedCount} 个账号`)
  } catch (error) {
    console.error('强制刷新失败:', error)
    showToast('强制刷新失败: ' + error.message, 'error')
  } finally {
    isForceRefreshingAll.value = false
  }
}

const deleteToken = async (email) => {
  if (!confirm('确定要删除此账号吗？')) return

  try {
    await axios.delete('/api/dreamina/deleteAccount', {
      data: { email },
      headers: {
        'Authorization': localStorage.getItem('apiKey') || ''
      }
    })
    await getTokens()
    showToast('删除账号成功')
  } catch (error) {
    console.error('删除账号失败:', error)
    showToast('删除账号失败: ' + error.message, 'error')
  }
}

const restoreAccount = async (email) => {
  try {
    await axios.post('/api/dreamina/restoreAccount', { email }, {
      headers: {
        'Authorization': localStorage.getItem('apiKey') || ''
      }
    })
    await getTokens()
    showToast(`账号 ${email} 可用性已恢复`)
  } catch (error) {
    console.error('恢复账号可用性失败:', error)
    showToast('恢复账号可用性失败: ' + error.message, 'error')
  }
}

const exportAccounts = async () => {
  try {
    // 分页获取所有账号
    let page = 1
    const batchSize = 500
    let allAccounts = []
    let hasMore = true

    while (hasMore) {
      const res = await axios.get('/api/dreamina/getAllAccounts', {
        params: { page, pageSize: batchSize },
        headers: { 'Authorization': localStorage.getItem('apiKey') || '' }
      })

      const accounts = res.data.data || []
      allAccounts = allAccounts.concat(accounts)

      if (accounts.length < batchSize) {
        hasMore = false
      } else {
        page++
      }
    }

    if (allAccounts.length === 0) {
      showToast('没有可导出的账号', 'error')
      return
    }

    const content = allAccounts.map(token => `${token.email}:${token.password}`).join('\n')
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'dreamina_accounts.txt'
    document.body.appendChild(link)
    link.click()

    setTimeout(() => {
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    }, 100)

    showToast(`导出完成，共 ${allAccounts.length} 个账号`)
  } catch (error) {
    console.error('导出失败:', error)
    showToast('导出失败: ' + error.message, 'error')
  }
}

const saveProxyTarget = async () => {
  try {
    await axios.post('/api/proxy/target', { target: proxyTarget.value }, {
      headers: { 'Authorization': localStorage.getItem('apiKey') || '' }
    })
    showToast('目标已保存')
  } catch (error) {
    console.error('保存透传目标失败:', error)
    showToast('保存透传目标失败: ' + (error?.message || ''), 'error')
  }
}

onMounted(() => {
  // 加载透传目标
  ;(async () => {
    try {
      const res = await axios.get('/api/proxy/target', {
        headers: { 'Authorization': localStorage.getItem('apiKey') || '' }
      })
      proxyTarget.value = res.data?.target || ''
    } catch (_) {}
  })()
  getTokens()
  try {
    const key = localStorage.getItem('apiKey') || ''
    if (key) {
      eventSource = new EventSource(`/api/events?apiKey=${encodeURIComponent(key)}`)
      eventSource.addEventListener('account:add:done', (e) => {
        try {
          const data = JSON.parse(e.data)
          showToast(`账号 ${data.email} ${data.success ? '添加成功' : '添加失败'}`, data.success ? 'success' : 'error')
          getTokens()
        } catch (_) {}
      })
      eventSource.addEventListener('account:batchAdd:done', (e) => {
        try {
          const data = JSON.parse(e.data)
          const failCount = (data.total || 0) - (data.successCount || 0)
          const msg = `批量添加完成：成功 ${data.successCount}/${data.total}`
          showToast(msg, failCount > 0 ? 'error' : 'success')
          getTokens()
        } catch (_) {}
      })
    }
  } catch (err) {
    console.error('SSE 连接失败:', err)
  }
})

onUnmounted(() => {
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }
})
</script>

<style lang="css" scoped>
@media (max-width: 640px) {
  .container {
    padding: 0;
  }
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s, transform 0.3s;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
.fade-enter-to, .fade-leave-from {
  opacity: 1;
  transform: translateY(0);
}

.token-card {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0.3));
  box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.15);
  transform: translateY(0);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.token-card:hover {
  transform: translateY(-5px);
}

.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.scrollbar-hide::-webkit-scrollbar {
  display: none;
}

@keyframes slideIn {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.token-card {
  animation: slideIn 0.5s ease-out;
  animation-fill-mode: both;
}

.token-card:nth-child(3n+1) { animation-delay: 0.1s; }
.token-card:nth-child(3n+2) { animation-delay: 0.2s; }
.token-card:nth-child(3n+3) { animation-delay: 0.3s; }

.overflow-x-auto {
  position: relative;
  cursor: pointer;
}

.overflow-x-auto::after {
  content: '';
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 24px;
  background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.8));
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s;
}

.overflow-x-auto:hover::after {
  opacity: 1;
}

/* 隐藏滚动条样式 */
.scrollbar-hidden {
  -ms-overflow-style: none;  /* IE and Edge */
  scrollbar-width: none;  /* Firefox */
}

.scrollbar-hidden::-webkit-scrollbar {
  display: none;  /* Chrome, Safari and Opera */
}

/* 自定义滚动条样式（备用） */
.max-h-\[calc\(100vh-200px\)\]::-webkit-scrollbar {
  width: 6px;
}

.max-h-\[calc\(100vh-200px\)\]::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.05);
  border-radius: 8px;
}

.max-h-\[calc\(100vh-200px\)\]::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.1);
  border-radius: 8px;
}

.max-h-\[calc\(100vh-200px\)\]::-webkit-scrollbar-thumb:hover {
  background-color: rgba(0, 0, 0, 0.2);
}

/* 自定义复选框样式 */
.custom-checkbox .checkbox-icon {
  position: relative;
  overflow: hidden;
}

.custom-checkbox .checkbox-icon:before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 100%;
  background: rgba(99, 102, 241, 0.1);
  transition: width 0.3s ease;
}

.custom-checkbox:hover .checkbox-icon:before {
  width: 100%;
}

.custom-checkbox input:checked + .checkbox-icon svg {
  animation: check-animation 0.5s cubic-bezier(0.17, 0.67, 0.83, 0.67);
  transform: scale(1);
}

@keyframes check-animation {
  0% {
    transform: scale(0);
  }
  50% {
    transform: scale(1.2);
  }
  100% {
    transform: scale(1);
  }
}

/* 给选中的卡片添加动画效果 */
.token-card.ring-2 {
  animation: selected-pulse 2s infinite;
}

@keyframes selected-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.4);
  }
  70% {
    box-shadow: 0 0 0 6px rgba(99, 102, 241, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(99, 102, 241, 0);
  }
}

/* 马卡龙紫色刷新按钮动画 */
@keyframes refresh-pulse-purple {
  0% {
    box-shadow: 0 0 0 0 rgba(168, 85, 247, 0.4);
  }
  70% {
    box-shadow: 0 0 0 6px rgba(168, 85, 247, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(168, 85, 247, 0);
  }
}

/* 马卡龙绿色刷新按钮动画 */
@keyframes refresh-pulse-green {
  0% {
    box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.4);
  }
  70% {
    box-shadow: 0 0 0 6px rgba(74, 222, 128, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(74, 222, 128, 0);
  }
}

/* 马卡龙粉色刷新按钮动画 */
@keyframes refresh-pulse-pink {
  0% {
    box-shadow: 0 0 0 0 rgba(236, 72, 153, 0.4);
  }
  70% {
    box-shadow: 0 0 0 6px rgba(236, 72, 153, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(236, 72, 153, 0);
  }
}

.action-button:hover {
  animation: refresh-pulse-purple 1.5s infinite;
}

/* 刷新中的按钮样式 - 马卡龙紫色 */
.refreshing-button-purple {
  background: linear-gradient(45deg, #c084fc, #a855f7);
  color: white;
  animation: refresh-pulse-purple 1.5s infinite;
  box-shadow: 0 4px 15px rgba(168, 85, 247, 0.3);
}

/* 刷新中的按钮样式 - 马卡龙绿色 */
.refreshing-button-green {
  background: linear-gradient(45deg, #86efac, #4ade80);
  color: white;
  animation: refresh-pulse-green 1.5s infinite;
  box-shadow: 0 4px 15px rgba(74, 222, 128, 0.3);
}

/* 刷新中的按钮样式 - 马卡龙粉色 */
.refreshing-button-pink {
  background: linear-gradient(45deg, #f472b6, #ec4899);
  color: white;
  animation: refresh-pulse-pink 1.5s infinite;
  box-shadow: 0 4px 15px rgba(236, 72, 153, 0.3);
}

/* 马卡龙色系按钮增强效果 */
.action-button {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(10px);
}

.action-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

/* 单个刷新按钮的马卡龙绿色样式增强 */
.text-green-600:hover {
  background: linear-gradient(135deg, #dcfce7, #bbf7d0) !important;
  border-color: #86efac !important;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(74, 222, 128, 0.2);
}

/* 绿色刷新按钮的基础样式 */
.bg-green-50 {
  background: linear-gradient(135deg, #f0fdf4, #dcfce7);
  border: 1px solid #bbf7d0;
}

.bg-green-50:hover {
  background: linear-gradient(135deg, #dcfce7, #bbf7d0);
  border-color: #86efac;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(74, 222, 128, 0.2);
}

/* 马卡龙绿色按钮样式 */
.macaron-green-button {
  background: linear-gradient(135deg, #f0fdf4, #dcfce7);
  border: 1px solid #bbf7d0;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.macaron-green-button:hover {
  background: linear-gradient(135deg, #dcfce7, #bbf7d0);
  border-color: #86efac;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(74, 222, 128, 0.2);
}

/* 马卡龙紫色按钮样式 */
.macaron-purple-button {
  background: linear-gradient(135deg, #faf5ff, #f3e8ff);
  border: 1px solid #e9d5ff;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.macaron-purple-button:hover {
  background: linear-gradient(135deg, #f3e8ff, #e9d5ff);
  border-color: #c4b5fd;
  transform: translateY(-2px);
  box-shadow: 0 4px 15px rgba(168, 85, 247, 0.2);
}

/* 马卡龙粉色按钮样式 */
.macaron-pink-button {
  background: linear-gradient(135deg, #fdf2f8, #fce7f3);
  border: 1px solid #f9a8d4;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.macaron-pink-button:hover {
  background: linear-gradient(135deg, #fce7f3, #fbcfe8);
  border-color: #f472b6;
  transform: translateY(-2px);
  box-shadow: 0 4px 15px rgba(236, 72, 153, 0.2);
}

/* 响应式优化 */
@media (max-width: 640px) {
  .action-button {
    font-size: 0.875rem;
    padding: 0.5rem 0.75rem;
  }

  .container {
    padding: 0 0.5rem;
  }
}

@media (max-width: 480px) {
  .action-button {
    font-size: 0.8rem;
    padding: 0.4rem 0.6rem;
  }
}
</style>
