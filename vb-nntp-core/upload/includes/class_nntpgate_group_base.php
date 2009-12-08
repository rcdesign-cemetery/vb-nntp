<?php
require_once DIR . '/includes/class_nntpgate_object.php';
class NNTPGate_Group_Base extends NNTPGate_Object
{
    /**
     *
     * @var int
     */
    protected $_group_id = 0;

    /**
     *
     * @var string
     */
    protected $_plugin_id = '';

    /**
     *
     * @var string
     */
    protected $_group_name = '';

    /**
     *
     * @var string
     */
    protected $_is_active = null; //enum('yes', 'no')

    /**
     *
     * @var int
     */
    protected $_map_id = 0;

    /**
     * read only
     *
     * @var string
     */
    protected $_date_create = null;

    /**
     *
     * @param int $value
     */
    public function set_group_id($value)
    {
        $this->_group_id = (int)$value;
    }

    /**
     *
     * @param string $value
     */
    public function set_plugin_id($value)
    {
        $this->_plugin_id = $this->_db->escape_string($value);
    }

    /**
     *
     * @param string $value
     */
    public function set_group_name($value)
    {
        $this->_group_name = $this->_db->escape_string($value);
    }

    /**
     *
     * @param int $value
     */
    public function set_map_id($value)
    {
        $this->_map_id = (int)$value;
    }

    /**
     *
     * @param bool $value
     */
    public function set_is_active($value)
    {
        $this->_is_active = (bool) $value ? 'yes' : 'no';
    }

    /**
     *
     * @return int
     */
    public function get_group_id()
    {
        return $this->_group_id;
    }

    /**
     *
     * @return string
     */
    public function get_plugin_id()
    {
        return $this->_plugin_id;
    }

    /**
     *
     * @return name
     */
    public function get_group_name()
    {
        return $this->_group_name;
    }

    /**
     *
     * @return bool
     */
    public function get_is_active()
    {
        return ('yes' == $this->_is_active);
    }

    /**
     *
     * @return int
     */
    public function get_map_id()
    {
        return $this->_map_id;
    }

    /**
     *
     * @return string
     */
    public function get_date_create()
    {
        return $this->_date_create;
    }

    /**
     * Insert/update record in nntp_groups
     *
     * @return bool
     */
    public function save_group()
    {
        $existing_group = $this->get_group_id_by_map_id($this->_map_id, true);
        if ( 0 < $existing_group)
        {
            //возможно это апдейт старой
            if ($existing_group != $this->_group_id)
            {
                return false;
            }
        }

        $sql = "INSERT INTO
                    `" . TABLE_PREFIX . "nntp_groups`
                SET
                    `id`          =  " . $this->_group_id . " ,
                    `plugin_id`   = '" . $this->_db->escape_string( $this->_plugin_id ) . "',
                    `group_name`  = '" . $this->_db->escape_string( $this->_group_name ) . "',
                    `is_active`   = '" . $this->_db->escape_string( $this->_is_active ) . "',
                    `map_id`      =  " . $this->_map_id . "
                ON DUPLICATE KEY UPDATE
                    `group_name`  = '" . $this->_db->escape_string( $this->_group_name ) . "',
                    `is_active`   = '" . $this->_db->escape_string( $this->_is_active) . "',
                    `map_id`      =  " . $this->_map_id;
        $this->_db->query_write( $sql );

        return true;
    }

    /**
     * Delete record from nntp_groups
     * Если значение group_id не передается в качестве параметра, то будет взято
     * из self::_group_id
     *
     * @param int $group_id
     * @return bool
     */
    public function delete_group ( $group_id = null)
    {
        if (is_null($group_id))
        {
            $group_id = $this->_group_id;
        }
        if (! $group_id)
        {
            return false;
        }
        $sql = "DELETE FROM
                    `" . TABLE_PREFIX . "nntp_index`
                WHERE
                    `groupid` = " . (int) $group_id;
        $this->_db->query_write($sql);
        $sql = "DELETE FROM
                    `" . TABLE_PREFIX . "nntp_groups`
                WHERE
                    `id` = " . (int) $group_id;
        $this->_db->query_write($sql);
        return true;
    }

    /**
     * Get group id by map.
     * Если значение map_id не передается в качестве параметра, то будет взято
     * из self::_map_id
     * От флага $external зависит будет ли результат записан в self::_group_id
     *
     * @param int $map_id
     * @param bool $external
     * @return int
     */
    public function get_group_id_by_map_id($map_id = null, $external = false)
    {
        if (is_null($map_id))
        {
            $map_id = $this->_map_id;
        }
        if ( !$map_id)
        {
            return 0;
        }
        // Find group id by map id
        $group_id = 0;
        $sql = "SELECT `id`
                FROM
                    `" . TABLE_PREFIX . "nntp_groups`
                WHERE
                    `map_id` =  " . $map_id;
        $res = $this->_db->query_first($sql);
        if( !empty( $res ) )
        {
            $group_id = intval($res['id']);
        }

        if ($external)
        {
            return $group_id;
        }
        else
        {
            return $this->_group_id = $group_id;
        }
    }

    /**
     * Get all groups
     *
     * @return array
     */
    public function get_groups_list()
    {
        $result = array();
        $sql = "SELECT
                `id` AS 'group_id' ,
                `plugin_id`,
                `group_name`,
                `is_active`,
                `map_id`,
                `date_create`
            FROM
                `nntp_groups`
            ORDER BY
                `group_name`";
        $db_groups_list = $this->_db->query_read($sql);
        while ( $row = $this->_db->fetch_array( $db_groups_list ) )
        {
            $result[] = $row;
        }
        return $result;
    }

    /**
     * Очищает таблицу nntp_index для выбранной группы
     * Если значение group_id не передается в качестве параметра, то будет взято
     * из self::_group_id
     *
     * @param int $group_id
     * @return bool
     */
    public function clean_group($group_id = null )
    {
        if (is_null($group_id))
        {
            $group_id = $this->_group_id;
        }
        if (! $group_id)
        {
            return false;
        }
        // mark messages in index as deleted
        $sql = "UPDATE
                    `" . TABLE_PREFIX . "nntp_index`
                SET
                    `deleted` = 'yes'
                WHERE
                    `groupid` = " . $group_id;
        $this->_db->query_write($sql);
        return true;
    }

    /**
     * Инициализирует объект по group_id
     * Если значение group_id не передается в качестве параметра, то будет взято
     * из self::_group_id
     *
     * @param int $group_id
     * @return bool
     */
    public function get_group($group_id = null)
    {
        if (is_null($group_id))
        {
            $group_id = $this->_group_id;
        }
        if (! $group_id)
        {
            return false;
        }
        $sql = "SELECT
                    `id` AS group_id,
                    `plugin_id`,
                    `group_name`,
                    `is_active`,
                    `map_id`,
                    `date_create`
                FROM
                    `" . TABLE_PREFIX . "nntp_groups`
                WHERE
                    `id` =  " . $group_id;
        $res = $this->_db->query_first($sql);
        if( !empty( $res ) )
        {
            $this->_group_id = intval($res['group_id']);
            $this->_plugin_id = $res['plugin_id'];
            $this->_group_name = $res['group_name'];
            $this->_is_active = $res['is_active'];
            $this->_map_id = intval($res['map_id']);
            $this->_date_create = $res['date_create'];
        }
        return true;
    }
}
